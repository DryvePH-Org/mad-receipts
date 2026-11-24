import "server-only";
import { getSettings } from "@/lib/data";
import { manilaToday } from "@/lib/dates";
import { noteAlreadyThere, planChanges, receivedText, scanNote, SHEET_CLASS, submittedText, type DocsField } from "@/lib/docs/bible";
import { loadCar } from "@/lib/docs/service";
import type { CaseType } from "@/lib/docs/types";
import { loadWorkflow } from "@/lib/docs/workflow";
import { normalizePlate } from "@/lib/rules/plate";
import { docsDb } from "./review-server";

// The car's scan and checklist become the car's row in MAD register (the database), at once. Nothing is written to a Google Sheet.

const COLUMN: Record<DocsField, string> = { classification: "classification", cr: "cr", or: "or_receipt", deed: "deed", sellers_id: "sellers_id", sec_cert: "sec_cert", sec_ids: "sec_ids", boards_reso: "boards_reso", encumbered: "encumbered", chattel: "chattel", promissory: "promissory", stencil: "stencil", remarks_1: "remarks" };

async function carInput(plate: string) {
  const car = await loadCar(plate);
  if (!car) throw new Error("This car is not in Car documents.");
  const present = new Set(car.analysis.files.flatMap((f) => f.types));
  const flags = [...new Set(car.analysis.files.flatMap((f) => f.flags))];
  const { details } = await loadWorkflow(plate);
  return { car, present, flags, details, name: car.folder.folder_name ?? car.folder.plate_display };
}

/** The case a person chose is the car's classification in the register at once (a company car is filed as Clean). */
export async function setRegisterClassification(plate: string, caseType: CaseType, actor: string): Promise<void> {
  const db = docsDb();
  const { data: unit } = await db.from("docs_units_current").select("id, classification").eq("plate_no", normalizePlate(plate)).maybeSingle();
  const want = SHEET_CLASS[caseType];
  if (unit && unit.classification !== want) await db.from("docs_units").update({ classification: want, updated_by: actor, last_change_source: "app" }).eq("id", unit.id);
}

/** The folder moved to Sold: the car's row says SOLD too, so the register and the folders never tell two different stories. */
export async function markRegisterSold(plate: string, actor: string): Promise<void> {
  const db = docsDb();
  const key = normalizePlate(plate);
  const { data: unit } = await db.from("docs_units_current").select("id, stock_state").eq("plate_no", key).maybeSingle();
  if (!unit || unit.stock_state === "Sold") return;
  await db.from("docs_units").update({ stock_state: "Sold", updated_by: actor, last_change_source: "app" }).eq("id", unit.id);
}

/** How many papers of the register row differ from what the car's folder says (only meaningful once a person has chosen the case). */
export function registerDiff(car: NonNullable<Awaited<ReturnType<typeof loadCar>>>, values: Record<string, string | null>): number {
  const current: Partial<Record<DocsField, string>> = {};
  for (const [field, col] of Object.entries(COLUMN) as [DocsField, string][]) current[field] = values[col] ?? "";
  const present = new Set(car.analysis.files.flatMap((f) => f.types));
  return planChanges({ caseType: car.caseType, present, current }).changes.length;
}

export type SyncResult = { ok: true; changed: string[]; created: boolean } | { ok: false; message: string };

/**
 * Updates the register from the car's documents: the classification from the case a person chose, each paper from what is in the folder
 * (the app's value wins), and the dated scan note added to REMARKS I. Every changed cell is kept in the car's history by the database.
 */
export async function syncRegister(plate: string, actor: string, now = new Date()): Promise<SyncResult> {
  const key = normalizePlate(plate);
  const input = await carInput(key);
  if (input.car.folder.case_source !== "manual") return { ok: false, message: "Choose the case first (Papers needed): the register is only filled with the case a person chose." };
  const db = docsDb();
  const { data: found } = await db.from("docs_units_current").select("*").eq("plate_no", key).maybeSingle();
  let unit = found as Record<string, string | null> | null;
  let created = false;
  if (!unit) {
    const r = await db.from("docs_units").insert({ plate_no: key, plate_display: input.car.folder.plate_display, classification: SHEET_CLASS[input.car.caseType], source: "app", last_change_source: "app", created_by: actor, updated_by: actor }).select("*").single();
    if (r.error) return { ok: false, message: `Could not add this car to the register: ${r.error.message}` };
    unit = r.data as Record<string, string | null>; created = true;
  }
  const current: Partial<Record<DocsField, string>> = {};
  for (const [field, col] of Object.entries(COLUMN) as [DocsField, string][]) current[field] = (unit[col] as string | null) ?? "";
  const plan = planChanges({ caseType: input.car.caseType, present: input.present, current });
  const patch: Record<string, string | null> = {};
  for (const c of plan.changes) patch[COLUMN[c.field]] = c.after;
  const note = scanNote({ now, carName: input.name, items: input.car.checklist.items.map((i) => ({ label: i.label, present: i.present, stage: i.stage, optional: i.optional })), flags: input.flags, details: input.details });
  const notes = (unit.remarks as string | null) ?? "";
  if (!noteAlreadyThere(notes, note)) patch.remarks = [notes, note].filter(Boolean).join("\n\n");
  if (Object.keys(patch).length === 0) return { ok: true, changed: [], created };
  const r = await db.from("docs_units").update({ ...patch, updated_by: actor, last_change_source: "app" }).eq("id", unit.id as string);
  if (r.error) return { ok: false, message: `Could not save: ${r.error.message}` };
  return { ok: true, changed: Object.keys(patch), created };
}

/** The handoff steps are kept in the register's own list (they used to be typed into the monthly sheet tabs). */
export async function recordHandoff(plate: string, event: "submitted" | "received", actor: string): Promise<void> {
  const key = normalizePlate(plate);
  const db = docsDb();
  const receiver = (await getSettings()).print.sheetReceiverName;
  const date = manilaToday();
  const text = event === "submitted" ? submittedText(receiver, date) : receivedText(receiver, date);
  const { data: unit } = await db.from("docs_units_current").select("id").eq("plate_no", key).maybeSingle();
  const r = await db.from("docs_handoff_events").insert({ unit_id: unit?.id ?? null, plate_no: key, event, event_date: date, person: receiver.toUpperCase(), original_text: text, source: "app", created_by: actor });
  if (r.error) throw new Error(`Could not record the handoff: ${r.error.message}`);
}

