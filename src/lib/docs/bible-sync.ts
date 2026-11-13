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
import { DOCS_FIELDS, planChanges, receivedText, scanNote, submittedText, type Change, type DocsField, type Plan } from "./bible";

// Talks to the grokbot about the Docs Bible: read a unit's row, work out what should change, and (when Google Sheets are not frozen) send the changes.

type Admin = ReturnType<typeof createAdminClient>;
export interface BibleDeps { grok: Deps; admin: Admin; sheetId: string | undefined }
export const defaultBibleDeps = (): BibleDeps => ({ grok: defaultGrokbotDeps(), admin: createAdminClient(), sheetId: process.env.DOCS_BIBLE_SHEET_ID?.trim() || undefined });

export interface BibleRow { found: boolean; matches: number; row: number | null; arrival: string; values: Partial<Record<DocsField, string>>; monthly: { tab: string; row: number } | null; message: string | null }
export interface BiblePreview extends Plan { row: BibleRow; note: string; frozen: boolean }

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
  const { result } = await sendJob("docs_row", { plate: normalizePlate(plate) }, deps.grok, { sheetId: deps.sheetId, timeoutMs: 110_000, createdBy });
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

async function carInput(plate: string, admin: Admin) {
  const car = await loadCar(plate, { admin });
  if (!car) throw new Error("This car is not in Car documents.");
  const present = new Set(car.analysis.files.flatMap((f) => f.types));
  const flags = [...new Set(car.analysis.files.flatMap((f) => f.flags))];
  const { details } = await loadWorkflow(plate, admin);
  return { car, present, flags, details, name: car.folder.folder_name ?? car.folder.plate_display };
}

const save = (admin: Admin, plate: string, kind: "checklist" | "submitted" | "received", status: string, detail: unknown, error: string | null, jobId: string | null, actor: string | null) =>
  admin.from("unit_sheet_sync").upsert({ plate_no: plate, kind, status, detail: detail as Json, error, job_id: jobId, updated_by: actor }, { onConflict: "plate_no,kind" });

/** What would be written, without writing anything (works while Google Sheets are frozen). */
export async function previewBible(plate: string, actor: string | null, deps: BibleDeps = defaultBibleDeps(), now = new Date()): Promise<BiblePreview> {
  const key = normalizePlate(plate);
  const [row, input] = await Promise.all([readBibleRow(key, deps, actor), carInput(key, deps.admin)]);
  if (!row.found) return { row, note: "", changes: [], notes: [row.message ?? (row.matches > 1 ? "More than one row in the sheet has this plate." : "This plate is not in the Docs Bible yet.")], frozen: sheetsFrozen() };
  const plan = planChanges({ caseType: input.car.caseType, present: input.present, current: row.values });
  const note = scanNote({ now, carName: input.name, items: input.car.checklist.items.map((i) => ({ label: i.label, present: i.present, stage: i.stage })), flags: input.flags, details: input.details });
  await save(deps.admin, key, "checklist", "previewed", { changes: plan.changes, notes: plan.notes }, null, null, actor);
  return { row, ...plan, note, frozen: sheetsFrozen() };
}

export type SendResult = { ok: true; written: number; skipped: string[] } | { ok: false; status: "frozen" | "conflict" | "failed"; message: string };

/** Writes the checklist to the sheet through the grokbot. The bot repeats the check that each cell still holds what we read. */
export async function sendBible(plate: string, actor: string, deps: BibleDeps = defaultBibleDeps(), now = new Date()): Promise<SendResult> {
  const key = normalizePlate(plate);
  try {
    const preview = await previewBible(key, actor, deps, now); // reading is allowed while frozen; writing below is not
    if (!preview.row.found) return { ok: false, status: "failed", message: preview.notes[0] ?? "Not found in the sheet." };
    const changes: Change[] = [...preview.changes, ...(preview.note && !preview.row.values.remarks_1?.includes(preview.note.split("\n")[0]) ? [{ field: "remarks_1" as DocsField, before: preview.row.values.remarks_1 ?? "", after: preview.note, mode: "append" as const }] : [])];
    if (!changes.length) { await save(deps.admin, key, "checklist", "done", { changes: [], note: "nothing to change" }, null, null, actor); return { ok: true, written: 0, skipped: preview.notes }; }
    const { jobId, result } = await sendJob("docs_update", { plate: key, expected_arrival: preview.row.arrival, changes, reason: "Documents approved in the MAD app", actor: actor.slice(0, 8), dry_run: false }, deps.grok, { sheetId: deps.sheetId, timeoutMs: 150_000, createdBy: actor });
    const applied = Array.isArray(result.applied) ? result.applied.length : 0;
    await save(deps.admin, key, "checklist", "done", { applied: result.applied ?? [], skipped: result.skipped ?? [] }, null, jobId, actor);
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
    const { jobId, result } = await sendJob("docs_handoff", { plate: key, event, text, date: isoDate, reason: event === "submitted" ? "Documents handed off in the MAD app" : "Documents returned, marked done in the MAD app", actor: actor.slice(0, 8), dry_run: false }, deps.grok, { sheetId: deps.sheetId, timeoutMs: 150_000, createdBy: actor });
    await save(deps.admin, key, event, "done", { text, cell: result.cell ?? null, tab: result.tab ?? null }, null, jobId, actor);
    return { ok: true, written: 1, skipped: [] };
  } catch (err) {
    if (err instanceof SheetsFrozenError) { await save(deps.admin, key, event, "frozen", {}, null, null, actor); return { ok: false, status: "frozen", message: err.message }; }
    const message = err instanceof Error ? err.message : "Could not update the sheet.";
    await save(deps.admin, key, event, /conflict/i.test(message) ? "conflict" : "failed", {}, message.slice(0, 500), null, actor);
    return { ok: false, status: /conflict/i.test(message) ? "conflict" : "failed", message };
  }
}

/** After the staff approve, hand off or mark done: tell the sheet in the background. While Google Sheets are frozen it only records that the update is waiting. */
export async function queueSheetSync(plate: string, kind: "checklist" | "submitted" | "received", actor: string, deps: BibleDeps = defaultBibleDeps()): Promise<void> {
  const key = normalizePlate(plate);
  if (sheetsFrozen()) { await save(deps.admin, key, kind, "frozen", {}, null, null, actor); return; }
  if (kind === "checklist") await sendBible(key, actor, deps);
  else await sendHandoffToSheet(key, kind, actor, deps);
}

export async function loadSheetStatus(plate: string, admin: Admin = createAdminClient()): Promise<{ kind: string; status: string; error: string | null; updatedAt: string; detail: unknown }[]> {
  const { data } = await admin.from("unit_sheet_sync").select("kind, status, error, updated_at, detail").eq("plate_no", normalizePlate(plate));
  return (data ?? []).map((r) => ({ kind: r.kind, status: r.status, error: r.error, updatedAt: r.updated_at, detail: r.detail }));
}
