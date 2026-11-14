import "server-only";
import { getSettings } from "@/lib/data";
import { manilaToday } from "@/lib/dates";
import { grokbotMissing, GrokbotError, sendJob, type Deps } from "@/lib/grokbot/client";
import { defaultGrokbotDeps } from "@/lib/grokbot/store";
import { SheetsFrozenError, sheetsFrozen } from "@/lib/google/freeze";
import { normalizePlate } from "@/lib/rules/plate";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { loadCar } from "./service";
import { loadWorkflow } from "./workflow";
import { checkHandoffAnswer, checkWriteAnswer, desiredValues, DOCS_FIELDS, noteAlreadyThere, planChanges, receivedText, scanNote, submittedText, type Change, type DocsField, type Plan } from "./bible";

// Talks to the grokbot about the Docs Bible: read a unit's row, work out what should change, and (when Google Sheets are not frozen) send the changes.

type Admin = ReturnType<typeof createAdminClient>;
export interface BibleDeps { grok: Deps; admin: Admin; sheetId: string | undefined }
export const defaultBibleDeps = (): BibleDeps => ({ grok: defaultGrokbotDeps(), admin: createAdminClient(), sheetId: process.env.DOCS_BIBLE_SHEET_ID?.trim() || undefined });

/** The tab names in the Docs Bible workbook. They change with the year ("DOCS 2027"), so they come from the settings and travel with every job. */
export const docsTabs = () => ({ docs: process.env.DOCS_BIBLE_DOCS_TAB?.trim() || "DOCS 2026", changelog: process.env.DOCS_BIBLE_CHANGELOG_TAB?.trim() || "CHANGELOG" });

export interface BibleRow { found: boolean; matches: number; row: number | null; arrival: string; values: Partial<Record<DocsField, string>>; monthly: { tab: string; row: number } | null; message: string | null }
export interface BiblePreview extends Plan { row: BibleRow; note: string; frozen: boolean }

export interface FastPreview {
  /** before is null when the sheet has not been read yet for this car */
  changes: { field: DocsField; before: string | null; after: string; mode: "set" | "append" }[];
  notes: string[]; note: string; frozen: boolean;
  /** when the app last read this car's row in the sheet, or null */
  checkedAt: string | null; row: number | null;
}

/**
 * The instant preview: built from the car's own documents, with no call to the bot. If the app has read this car's row in the sheet
 * before, the before-values come from that reading (and its time is shown); otherwise only what will be written is listed.
 * Nothing is trusted from here: the bot checks every cell again when the changes are sent.
 */
export async function previewBibleFast(plate: string, deps: Pick<BibleDeps, "admin"> = { admin: createAdminClient() }, now = new Date()): Promise<FastPreview> {
  const key = normalizePlate(plate);
  const [input, snap] = await Promise.all([carInput(key, deps.admin), loadSnapshot(deps.admin, key)]);
  const note = scanNote({ now, carName: input.name, items: input.car.checklist.items.map((i) => ({ label: i.label, present: i.present, stage: i.stage })), flags: input.flags, details: input.details });
  if (snap) {
    const plan = planChanges({ caseType: input.car.caseType, present: input.present, current: snap.values });
    return { changes: plan.changes, notes: plan.notes, note, frozen: sheetsFrozen("docs"), checkedAt: snap.fetchedAt, row: snap.row };
  }
  const wanted = desiredValues({ caseType: input.car.caseType, present: input.present, current: {} });
  return { changes: (Object.entries(wanted) as [DocsField, string][]).map(([field, after]) => ({ field, before: null, after, mode: "set" as const })), notes: ["The sheet has not been read for this car yet. When you send, the bot compares each cell first and only fills what is blank."], note, frozen: sheetsFrozen("docs"), checkedAt: null, row: null };
}

/** Reads the car's row in the sheet through the bot, keeps it, and lists what would change (read only, works while frozen). */
export async function checkSheet(plate: string, actor: string | null, deps: BibleDeps = defaultBibleDeps(), now = new Date()): Promise<FastPreview> {
  const key = normalizePlate(plate);
  const row = await readBibleRow(key, deps, actor);
  const snap: Snapshot = { row: row.row, arrival: row.arrival, values: row.values, monthly: row.monthly, fetchedAt: now.toISOString() };
  if (row.found) await keepSnapshot(deps.admin, key, snap, actor);
  const fast = await previewBibleFast(key, deps, now);
  if (!row.found) return { ...fast, changes: [], checkedAt: null, notes: [row.message ?? (row.matches > 1 ? "More than one row in the sheet has this plate." : "This plate is not in the Docs Bible yet.")] };
  return fast;
}

function ready(deps: BibleDeps): string | null {
  const missing = grokbotMissing();
  if (missing.length) return `The grokbot is not set up on this server (${missing.join(", ")}).`;
  if (!deps.sheetId) return "The Docs Bible sheet is not set (DOCS_BIBLE_SHEET_ID).";
  return null;
}

/** Asks the grokbot for this unit's row in DOCS 2026 (read only). */
export async function readBibleRow(plate: string, deps: BibleDeps = defaultBibleDeps(), createdBy: string | null = null): Promise<BibleRow> {
  const problem = ready(deps);
  if (problem) throw new GrokbotError(problem);
  const { result } = await sendJob("docs_row", { plate: normalizePlate(plate), tabs: docsTabs() }, deps.grok, { sheetId: deps.sheetId, timeoutMs: 110_000, createdBy });
  const values = result.values && typeof result.values === "object" ? (result.values as Record<string, unknown>) : {};
  const clean: Partial<Record<DocsField, string>> = {};
  for (const k of Object.keys(DOCS_FIELDS) as DocsField[]) if (typeof values[k] === "string") clean[k] = values[k] as string;
  const monthly = result.monthly && typeof result.monthly === "object" ? (result.monthly as { tab?: unknown; row?: unknown }) : null;
  return {
    found: result.found === true, matches: Number(result.matches) || 0, row: Number.isFinite(Number(result.row)) ? Number(result.row) : null,
    arrival: typeof result.arrival === "string" ? result.arrival : "", values: clean,
    monthly: monthly && typeof monthly.tab === "string" && Number.isFinite(Number(monthly.row)) ? { tab: monthly.tab, row: Number(monthly.row) } : null,
    message: typeof result.message === "string" ? result.message : null,
  };
}

export async function carInput(plate: string, admin: Admin) {
  const car = await loadCar(plate, { admin });
  if (!car) throw new Error("This car is not in Car documents.");
  const present = new Set(car.analysis.files.flatMap((f) => f.types));
  const flags = [...new Set(car.analysis.files.flatMap((f) => f.flags))];
  const { details } = await loadWorkflow(plate, admin);
  return { car, present, flags, details, name: car.folder.folder_name ?? car.folder.plate_display };
}

export interface Snapshot { row: number | null; arrival: string; values: Partial<Record<DocsField, string>>; monthly: { tab: string; row: number } | null; fetchedAt: string }

/** The last row the bot read for this plate, kept with the checklist's sync record. */
async function loadSnapshot(admin: Admin, plate: string): Promise<Snapshot | null> {
  const { data } = await admin.from("unit_sheet_sync").select("detail").eq("plate_no", plate).eq("kind", "checklist").maybeSingle();
  const s = data?.detail && typeof data.detail === "object" && !Array.isArray(data.detail) ? (data.detail as Record<string, unknown>).snapshot : null;
  return s && typeof s === "object" ? (s as Snapshot) : null;
}

export type SyncKind = "checklist" | "submitted" | "received" | "pricelist";
const save = async (admin: Admin, plate: string, kind: SyncKind, status: string, detail: unknown, error: string | null, jobId: string | null, actor: string | null) => {
  let merged = detail as Record<string, unknown>;
  if (kind === "checklist" && merged && typeof merged === "object" && !("snapshot" in merged)) {
    const snap = await loadSnapshot(admin, plate); // what the app last read in the sheet is kept across status changes
    if (snap) merged = { ...merged, snapshot: snap };
  }
  return admin.from("unit_sheet_sync").upsert({ plate_no: plate, kind, status, detail: merged as Json, error, job_id: jobId, updated_by: actor }, { onConflict: "plate_no,kind" });
};

export interface Working { action: "check" | "send"; since: string }
/** A bot job takes a minute or two, so the page does not wait for it: it marks the car as "working" and shows the result when it is in. */
export const STALE_WORK_MS = 8 * 60_000;

async function currentDetail(admin: Admin, plate: string): Promise<{ status: string; detail: Record<string, unknown>; jobId: string | null } | null> {
  const { data } = await admin.from("unit_sheet_sync").select("status, detail, job_id").eq("plate_no", plate).eq("kind", "checklist").maybeSingle();
  return data ? { status: data.status, detail: data.detail && typeof data.detail === "object" && !Array.isArray(data.detail) ? (data.detail as Record<string, unknown>) : {}, jobId: data.job_id } : null;
}

/** Marks that the bot is working on this car's sheet row. The next record saved for the car (done, failed...) replaces the mark. */
export async function markWorking(plate: string, action: Working["action"], actor: string | null, admin: Admin = createAdminClient(), now = new Date()): Promise<void> {
  const key = normalizePlate(plate);
  const cur = await currentDetail(admin, key);
  await admin.from("unit_sheet_sync").upsert({ plate_no: key, kind: "checklist", status: cur?.status ?? "previewed", detail: { ...(cur?.detail ?? {}), working: { action, since: now.toISOString() } } as Json, job_id: cur?.jobId ?? null, updated_by: actor }, { onConflict: "plate_no,kind" });
}

export async function loadWorking(plate: string, admin: Admin = createAdminClient(), now = new Date()): Promise<Working | null> {
  const w = (await currentDetail(admin, normalizePlate(plate)))?.detail.working as Working | undefined;
  return w && typeof w.since === "string" && now.getTime() - Date.parse(w.since) < STALE_WORK_MS ? w : null;
}

const keepSnapshot = async (admin: Admin, plate: string, snapshot: Snapshot, actor: string | null) => {
  const { data } = await admin.from("unit_sheet_sync").select("status, detail, job_id").eq("plate_no", plate).eq("kind", "checklist").maybeSingle();
  const { working: _working, ...rest } = (data?.detail && typeof data.detail === "object" && !Array.isArray(data.detail) ? (data.detail as Record<string, unknown>) : {}) as Record<string, unknown>; void _working;
  const detail = { ...rest, snapshot };
  await save(admin, plate, "checklist", data?.status ?? "previewed", detail, null, data?.job_id ?? null, actor);
};

/** What would be written, after reading the sheet through the bot, without writing anything (works while Google Sheets are frozen). */
export async function previewBible(plate: string, actor: string | null, deps: BibleDeps = defaultBibleDeps(), now = new Date()): Promise<BiblePreview> {
  const key = normalizePlate(plate);
  const [row, input] = await Promise.all([readBibleRow(key, deps, actor), carInput(key, deps.admin)]);
  if (!row.found) return { row, note: "", changes: [], notes: [row.message ?? (row.matches > 1 ? "More than one row in the sheet has this plate." : "This plate is not in the Docs Bible yet.")], frozen: sheetsFrozen("docs") };
  const plan = planChanges({ caseType: input.car.caseType, present: input.present, current: row.values });
  const note = scanNote({ now, carName: input.name, items: input.car.checklist.items.map((i) => ({ label: i.label, present: i.present, stage: i.stage })), flags: input.flags, details: input.details });
  if (row.found) await keepSnapshot(deps.admin, key, { row: row.row, arrival: row.arrival, values: row.values, monthly: row.monthly, fetchedAt: now.toISOString() }, actor);
  return { row, ...plan, note, frozen: sheetsFrozen("docs") };
}

export type SendResult = { ok: true; written: number; skipped: string[] } | { ok: false; status: "frozen" | "conflict" | "failed"; message: string };

/** Writes the checklist to the sheet through the grokbot. The bot repeats the check that each cell still holds what we read. */
export async function sendBible(plate: string, actor: string, deps: BibleDeps = defaultBibleDeps(), now = new Date()): Promise<SendResult> {
  const key = normalizePlate(plate);
  try {
    const preview = await previewBible(key, actor, deps, now); // reading is allowed while frozen; writing below is not
    if (!preview.row.found) return { ok: false, status: "failed", message: preview.notes[0] ?? "Not found in the sheet." };
    const changes: Change[] = [...preview.changes, ...(preview.note && !noteAlreadyThere(preview.row.values.remarks_1, preview.note) ? [{ field: "remarks_1" as DocsField, before: preview.row.values.remarks_1 ?? "", after: preview.note, mode: "append" as const }] : [])];
    if (!changes.length) { await save(deps.admin, key, "checklist", "done", { changes: [], note: "nothing to change" }, null, null, actor); return { ok: true, written: 0, skipped: preview.notes }; }
    const { jobId, result } = await sendJob("docs_update", { plate: key, tabs: docsTabs(), expected_arrival: preview.row.arrival, changes, reason: "Documents approved in the MAD app", actor: actor.slice(0, 8), dry_run: false }, deps.grok, { sheetId: deps.sheetId, timeoutMs: 150_000, createdBy: actor });
    const check = checkWriteAnswer(changes, result);
    if (!check.ok) { // do not trust it: the sheet may be half written, so the stored reading is dropped and the person is told to look
      const message = `The bot's answer could not be trusted (${check.problems.join("; ")}). Open the row in the sheet and press Check the sheet now.`;
      await save(deps.admin, key, "checklist", "failed", { snapshot: null, problems: check.problems }, message.slice(0, 500), jobId, actor);
      return { ok: false, status: "failed", message };
    }
    const applied = check.written;
    const after = { ...preview.row.values };
    for (const c of changes) after[c.field] = c.mode === "append" ? [after[c.field], c.after].filter(Boolean).join("\n\n") : c.after;
    await save(deps.admin, key, "checklist", "done", { applied: result.applied ?? [], skipped: result.skipped ?? [], snapshot: { row: preview.row.row, arrival: preview.row.arrival, values: after, monthly: preview.row.monthly, fetchedAt: now.toISOString() } }, null, jobId, actor);
    return { ok: true, written: applied, skipped: preview.notes };
  } catch (err) {
    if (err instanceof SheetsFrozenError) { await save(deps.admin, key, "checklist", "frozen", {}, null, null, actor); return { ok: false, status: "frozen", message: err.message }; }
    const message = err instanceof Error ? err.message : "Could not update the sheet.";
    const conflict = /conflict/i.test(message);
    await save(deps.admin, key, "checklist", conflict ? "conflict" : "failed", {}, message.slice(0, 500), null, actor);
    return { ok: false, status: conflict ? "conflict" : "failed", message };
  }
}

/** Writes a handoff step into the plate's monthly tab: the dated sentence in the next empty UPDATES cell. */
export async function sendHandoffToSheet(plate: string, event: "submitted" | "received", actor: string, deps: BibleDeps = defaultBibleDeps(), isoDate = manilaToday()): Promise<SendResult> {
  const key = normalizePlate(plate);
  try {
    const problem = ready(deps);
    if (problem) throw new GrokbotError(problem);
    const receiver = (await getSettings()).print.sheetReceiverName;
    const text = event === "submitted" ? submittedText(receiver, isoDate) : receivedText(receiver, isoDate);
    const { jobId, result } = await sendJob("docs_handoff", { plate: key, tabs: docsTabs(), event, text, date: isoDate, reason: event === "submitted" ? "Documents handed off in the MAD app" : "Documents returned, marked done in the MAD app", actor: actor.slice(0, 8), dry_run: false }, deps.grok, { sheetId: deps.sheetId, timeoutMs: 150_000, createdBy: actor });
    const check = checkHandoffAnswer(text, result);
    if (!check.ok) {
      const message = `The bot's answer could not be trusted (${check.problems.join("; ")}). Look at the monthly tab in the sheet.`;
      await save(deps.admin, key, event, "failed", { text, problems: check.problems }, message.slice(0, 500), jobId, actor);
      return { ok: false, status: "failed", message };
    }
    await save(deps.admin, key, event, "done", { text, cell: result.cell ?? null, tab: result.tab ?? null }, null, jobId, actor);
    return { ok: true, written: check.written, skipped: [] };
  } catch (err) {
    if (err instanceof SheetsFrozenError) { await save(deps.admin, key, event, "frozen", {}, null, null, actor); return { ok: false, status: "frozen", message: err.message }; }
    const message = err instanceof Error ? err.message : "Could not update the sheet.";
    await save(deps.admin, key, event, /conflict/i.test(message) ? "conflict" : "failed", {}, message.slice(0, 500), null, actor);
    return { ok: false, status: /conflict/i.test(message) ? "conflict" : "failed", message };
  }
}

/** After the staff approve, hand off or mark done: tell the sheet in the background. While Google Sheets are frozen it only records that the update is waiting. */
export async function queueSheetSync(plate: string, kind: SyncKind, actor: string, deps: BibleDeps = defaultBibleDeps()): Promise<void> {
  const key = normalizePlate(plate);
  if (sheetsFrozen("docs")) { await save(deps.admin, key, kind, "frozen", {}, null, null, actor); return; }
  if (kind === "checklist") await sendBible(key, actor, deps);
  else if (kind === "pricelist") { if (process.env.PRICELIST_SHEET_ID || process.env.CARS_SHEET_ID) await (await import("./pricelist-sync")).sendPricelist(key, actor, deps); }
  else await sendHandoffToSheet(key, kind, actor, deps);
}

/** Runs a check in the background and records a failure if it cannot finish (so the card never stays "working"). */
export async function runCheckInBackground(plate: string, actor: string, deps: BibleDeps = defaultBibleDeps()): Promise<void> {
  const key = normalizePlate(plate);
  try { await checkSheet(key, actor, deps); }
  catch (err) { await save(deps.admin, key, "checklist", "failed", {}, (err instanceof Error ? err.message : "Could not read the sheet.").slice(0, 500), null, actor); }
}

export async function runSendInBackground(plate: string, actor: string, deps: BibleDeps = defaultBibleDeps()): Promise<void> {
  const key = normalizePlate(plate);
  try {
    await sendBible(key, actor, deps); // records its own result
    if (process.env.PRICELIST_SHEET_ID || process.env.CARS_SHEET_ID) await (await import("./pricelist-sync")).sendPricelist(key, actor, deps); // then the pricelist
  }
  catch (err) { await save(deps.admin, key, "checklist", "failed", {}, (err instanceof Error ? err.message : "Could not update the sheet.").slice(0, 500), null, actor); }
}

export const saveSyncRecord = (...args: Parameters<typeof save>) => save(...args);

export async function loadSheetStatus(plate: string, admin: Admin = createAdminClient()): Promise<{ kind: string; status: string; error: string | null; updatedAt: string; detail: unknown }[]> {
  const { data } = await admin.from("unit_sheet_sync").select("kind, status, error, updated_at, detail").eq("plate_no", normalizePlate(plate));
  return (data ?? []).map((r) => ({ kind: r.kind, status: r.status, error: r.error, updatedAt: r.updated_at, detail: r.detail }));
}
