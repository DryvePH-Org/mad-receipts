import "server-only";
import { grokbotConfig, GrokbotError, sendJob, type Deps } from "@/lib/grokbot/client";
import { defaultGrokbotDeps } from "@/lib/grokbot/store";
import { normalizePlate } from "@/lib/rules/plate";
import { readingFromReply } from "./reader";
import { defaultDocsDeps, recompute, saveReading, type DocsDeps } from "./service";
import { signFileToken } from "./signed-url";

// Reading the document photos with the grokbot instead of a picture-reading API. The app gives the bot short-lived links to a car's
// waiting photos in ONE job; the bot opens each one and answers with what every photo shows (same answer format as the picture reader).

export const readerMode = (): "grokbot" | "api" => (process.env.DOCS_READER?.trim().toLowerCase() === "grokbot" ? "grokbot" : "api");

/** Photos per bot job. A bot run takes minutes, so many photos go together. */
export const SCAN_BATCH = 6;
export const SCAN_TIMEOUT_MS = 280_000;

export interface ScanSummary { sent: number; read: number; failed: number; message: string | null }

// Which cars are being scanned right now (this server process), so the page can show progress and two scans never run for one car.
const g = globalThis as unknown as { __madScans?: { timers: Map<string, ReturnType<typeof setTimeout>>; active: Set<string> } };
const state = () => (g.__madScans ??= { timers: new Map(), active: new Set() });
export const isScanning = (plate: string): boolean => { const k = normalizePlate(plate); return state().active.has(k) || state().timers.has(k); };

export interface ScanDeps { docs: DocsDeps; grok: Deps; baseUrl: string; secret: string }
export function defaultScanDeps(): ScanDeps {
  const cfg = grokbotConfig();
  return { docs: defaultDocsDeps(), grok: defaultGrokbotDeps(), baseUrl: cfg?.callbackBase ?? "", secret: cfg?.callbackSecret ?? "" };
}

/** Sends a car's waiting photos to the bot (one job per batch) and saves what it read. Keeps going until nothing is waiting or something fails. */
export async function scanWithBot(plate: string, deps: ScanDeps = defaultScanDeps(), now = Date.now()): Promise<ScanSummary> {
  const key = normalizePlate(plate);
  const { active } = state();
  if (active.has(key)) return { sent: 0, read: 0, failed: 0, message: "A scan of this car is already running." };
  if (!deps.baseUrl || !deps.secret) return { sent: 0, read: 0, failed: 0, message: "The grokbot is not set up on this server." };
  active.add(key);
  const total: ScanSummary = { sent: 0, read: 0, failed: 0, message: null };
  try {
    for (let round = 0; round < 4; round++) {
      const { data: todo } = await deps.docs.admin.from("folder_files").select("id, filename").eq("plate_no", key).eq("read_status", "pending").order("created_at").order("filename").limit(SCAN_BATCH);
      if (!todo?.length) break;
      const files = todo.map((f) => ({ file_id: f.id, name: f.filename, url: `${deps.baseUrl}/api/docs/scan-file/${signFileToken(f.id, deps.secret, now)}` }));
      total.sent += files.length;
      let results: Map<string, unknown>;
      try {
        const { result } = await sendJob("docs_scan", { plate: key, files }, deps.grok, { timeoutMs: SCAN_TIMEOUT_MS });
        results = new Map((Array.isArray(result.results) ? result.results : []).filter((r): r is Record<string, unknown> => !!r && typeof r === "object").map((r) => [String(r.file_id ?? ""), r]));
      } catch (err) {
        const message = err instanceof GrokbotError || err instanceof Error ? err.message : "The bot could not scan.";
        await deps.docs.admin.from("folder_files").update({ read_status: "failed", read_error: message.slice(0, 300), read_at: new Date(now).toISOString() }).in("id", files.map((f) => f.file_id));
        total.failed += files.length; total.message = message;
        break;
      }
      for (const f of files) {
        const reading = readingFromReply(results.get(f.file_id));
        if (!reading) {
          await deps.docs.admin.from("folder_files").update({ read_status: "failed", read_error: "The bot did not return this photo. Press Scan again.", read_at: new Date(now).toISOString() }).eq("id", f.file_id);
          total.failed++;
          continue;
        }
        await saveReading(deps.docs.admin, { id: f.file_id }, reading);
        total.read++;
      }
    }
    await recompute(key, deps.docs);
    if (total.read > 0) await deps.docs.after?.(key).catch(() => undefined);
  } finally {
    active.delete(key);
  }
  return total;
}

/**
 * Starts a scan of the car soon. A call within the delay replaces the earlier one, so a person adding photos one by one gets ONE bot job
 * for the whole group, not one per photo.
 */
export function scheduleScan(plate: string, delayMs: number, run: (plate: string) => Promise<unknown> = (p) => scanWithBot(p)): void {
  const key = normalizePlate(plate);
  const { timers } = state();
  const old = timers.get(key);
  if (old) clearTimeout(old);
  timers.set(key, setTimeout(() => { timers.delete(key); void run(key).catch((e) => console.warn(`[docs] bot scan failed: ${e instanceof Error ? e.message : "unknown"}`)); }, delayMs));
}
