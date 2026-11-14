import "server-only";
import { grokbotConfig, GrokbotError, startJob, type Deps } from "@/lib/grokbot/client";
import { defaultGrokbotDeps } from "@/lib/grokbot/store";
import { normalizePlate } from "@/lib/rules/plate";
import { readingFromReply, type Reading } from "./reader";
import { defaultDocsDeps, recompute, saveReading, type DocsDeps } from "./service";
import { signFileToken } from "./signed-url";

// Reading the document photos with the grokbot instead of a picture-reading API. The app gives the bot short-lived links to a car's
// waiting photos in ONE job and does not wait: a bot run can take several minutes. When the bot answers, the callback hands the answer
// to applyScanAnswer, which saves what every photo showed. The page follows the job's record, so nothing depends on a request staying open.

export const readerMode = (): "grokbot" | "api" => (process.env.DOCS_READER?.trim().toLowerCase() === "grokbot" ? "grokbot" : "api");

/** Photos per bot job. */
export const SCAN_BATCH = 6;
/** Scan jobs older than this no longer count as running (the queue gives up unanswered ones itself). */
export const SCAN_STALE_MS = 15 * 60_000;
/** The most bot jobs started for one car in an hour, so a loop can never run away. */
const MAX_JOBS_PER_HOUR = 12;

export interface ScanDeps { docs: DocsDeps; grok: Deps; baseUrl: string; secret: string }
export function defaultScanDeps(): ScanDeps {
  const cfg = grokbotConfig();
  return { docs: defaultDocsDeps(), grok: defaultGrokbotDeps(), baseUrl: cfg?.callbackBase ?? "", secret: cfg?.callbackSecret ?? "" };
}

// The links last 90 minutes: a scan may wait in the queue before the bot gets to it.
// Photos added one by one are grouped: a scan starts shortly after the LAST one (this server process).
const g = globalThis as unknown as { __madScanTimers?: Map<string, ReturnType<typeof setTimeout>> };
const timers = () => (g.__madScanTimers ??= new Map());

/** Whether a scan of this car is waiting to start or the bot is working on one (read from the jobs table, so it survives a restart). */
export async function isScanning(plate: string, admin: DocsDeps["admin"] = defaultDocsDeps().admin, now = Date.now()): Promise<boolean> {
  const key = normalizePlate(plate);
  if (timers().has(key)) return true;
  const { count } = await admin.from("grokbot_jobs").select("id", { count: "exact", head: true }).eq("action", "docs_scan").in("status", ["queued", "sent"]).eq("plate_no", key).gte("created_at", new Date(now - SCAN_STALE_MS - 3_600_000).toISOString());
  return (count ?? 0) > 0;
}

/** Sends the car's waiting photos to the bot as one job and returns at once. */
export async function startBotScan(plate: string, deps: ScanDeps = defaultScanDeps(), now = Date.now()): Promise<{ started: boolean; sent: number; message: string | null }> {
  const key = normalizePlate(plate);
  if (!deps.baseUrl || !deps.secret) return { started: false, sent: 0, message: "The grokbot is not set up on this server." };
  if (await isScanning(key, deps.docs.admin, now)) return { started: false, sent: 0, message: "A scan of this car is already running." };
  const since = new Date(now - 3_600_000).toISOString();
  const { count: recent } = await deps.docs.admin.from("grokbot_jobs").select("id", { count: "exact", head: true }).eq("action", "docs_scan").eq("plate_no", key).gte("created_at", since);
  if ((recent ?? 0) >= MAX_JOBS_PER_HOUR) return { started: false, sent: 0, message: "Too many scans for this car in the last hour." };
  const { data: todo } = await deps.docs.admin.from("folder_files").select("id, filename").eq("plate_no", key).eq("read_status", "pending").order("created_at").order("filename").limit(SCAN_BATCH);
  if (!todo?.length) return { started: false, sent: 0, message: null };
  const files = todo.map((f) => ({ file_id: f.id, name: f.filename, url: `${deps.baseUrl}/api/docs/scan-file/${signFileToken(f.id, deps.secret, now, 90)}` }));
  try {
    await startJob("docs_scan", { plate: key, files }, deps.grok, { plate: key });
    return { started: true, sent: files.length, message: null };
  } catch (err) {
    const message = err instanceof GrokbotError || err instanceof Error ? err.message : "The bot could not start.";
    await deps.docs.admin.from("folder_files").update({ read_status: "failed", read_error: message.slice(0, 300), read_at: new Date(now).toISOString() }).in("id", files.map((f) => f.file_id));
    return { started: false, sent: files.length, message };
  }
}

/** Matches the bot's answer to the photos that were sent: what was read for each, and which photos the bot did not return. Pure. */
export function planScanResults(fileIds: string[], items: unknown): { readings: Map<string, Reading>; missing: string[] } {
  const byId = new Map<string, unknown>();
  for (const it of Array.isArray(items) ? items : []) if (it && typeof it === "object") byId.set(String((it as { file_id?: unknown }).file_id ?? ""), it);
  const readings = new Map<string, Reading>(), missing: string[] = [];
  for (const id of fileIds) { const r = readingFromReply(byId.get(id)); if (r) readings.set(id, r); else missing.push(id); }
  return { readings, missing };
}

/**
 * The bot's answer to a scan job arrived: save what each photo showed, update the car, and start the next batch if photos are still waiting.
 * Safe to run twice and safe after a long wait: a photo that is already read is left alone.
 */
export async function applyScanAnswer(jobId: string, deps: ScanDeps = defaultScanDeps()): Promise<{ read: number; failed: number }> {
  const admin = deps.docs.admin;
  const { data: job } = await admin.from("grokbot_jobs").select("action, status, result, error, request").eq("id", jobId).maybeSingle();
  if (!job || job.action !== "docs_scan" || job.status === "sent") return { read: 0, failed: 0 };
  const req = (job.request ?? {}) as { plate?: string; files?: { file_id?: string }[] };
  const plate = normalizePlate(req.plate ?? "");
  const ids = (req.files ?? []).map((f) => String(f.file_id ?? "")).filter(Boolean);
  if (!plate || !ids.length) return { read: 0, failed: 0 };
  const { data: rows } = await admin.from("folder_files").select("id, read_status").in("id", ids);
  const open = new Set((rows ?? []).filter((r) => r.read_status !== "done").map((r) => r.id));
  let read = 0, failed = 0;
  if (job.status === "failed") {
    for (const id of open) { await admin.from("folder_files").update({ read_status: "failed", read_error: (job.error ?? "The bot could not scan this photo.").slice(0, 300), read_at: new Date().toISOString() }).eq("id", id); failed++; }
  } else {
    const { readings, missing } = planScanResults(ids, (job.result as { results?: unknown } | null)?.results);
    for (const [id, reading] of readings) if (open.has(id)) { await saveReading(admin, { id }, reading); read++; }
    for (const id of missing) if (open.has(id)) { await admin.from("folder_files").update({ read_status: "failed", read_error: "The bot did not return this photo. Press Scan again.", read_at: new Date().toISOString() }).eq("id", id); failed++; }
  }
  await recompute(plate, deps.docs);
  if (read > 0) await deps.docs.after?.(plate).catch(() => undefined);
  if (job.status === "done") await startBotScan(plate, deps).catch(() => undefined); // more photos waiting: the next batch
  return { read, failed };
}

/**
 * Starts a scan of the car soon. A call within the delay replaces the earlier one, so a person adding photos one by one gets ONE bot job
 * for the whole group, not one per photo.
 */
export function scheduleScan(plate: string, delayMs: number, run: (plate: string) => Promise<unknown> = (p) => startBotScan(p)): void {
  const key = normalizePlate(plate);
  const t = timers();
  const old = t.get(key);
  if (old) clearTimeout(old);
  t.set(key, setTimeout(() => { t.delete(key); void run(key).catch((e) => console.warn(`[docs] bot scan failed: ${e instanceof Error ? e.message : "unknown"}`)); }, delayMs));
}
