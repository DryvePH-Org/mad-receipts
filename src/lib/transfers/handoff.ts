import "server-only";
import { docsDb } from "@/lib/docsbible/review-server";
import { normalizePlate } from "@/lib/rules/plate";
import { stageFor, stepBack, type StepDates } from "./steps";

// The documents handoff, kept on the sale/transfer record of the car (migration 48) instead of a second tracker. The car's current record is the one
// that has the latest handoff, otherwise its latest sale that is not cancelled.

/** A record made only because papers were handed off for a car that has no sale record yet. */
export const NO_SALE_DETAILS = "No sale details yet (buyer, price, sold date, salesperson): add them.";
const COLS = "id, plate_no, stage, sold_on, created_at, handed_off_at, handoff_note, handoff_checked, back_at, released_on, delivered_on, last_reminded_at";
type Row = { id: string; plate_no: string; stage: string; sold_on: string | null; created_at: string; handed_off_at: string | null; handoff_note: string | null; handoff_checked: string[] | null; back_at: string | null; released_on: string | null; delivered_on: string | null; last_reminded_at: string | null };

export interface HandoffInfo extends StepDates {
  transferId: string; plate: string; stage: string; note: string | null; checked: string[]; lastRemindedAt: string | null;
}
const infoOf = (r: Row): HandoffInfo => ({ transferId: r.id, plate: r.plate_no, stage: r.stage, note: r.handoff_note, checked: r.handoff_checked ?? [], lastRemindedAt: r.last_reminded_at,
  handedOffAt: r.handed_off_at, backAt: r.back_at, releasedOn: r.released_on, deliveredOn: r.delivered_on });

const newest = (rows: Row[]) => [...rows].sort((a, b) => (b.sold_on ?? "").localeCompare(a.sold_on ?? "") || b.created_at.localeCompare(a.created_at))[0];
const latestOut = (rows: Row[]) => [...rows].filter((r) => r.handed_off_at).sort((a, b) => b.handed_off_at!.localeCompare(a.handed_off_at!))[0];

/** Is the car sold, by its status (a sold car may have no folder in Drive, and its transfer goes on all the same)? */
export async function isSoldCar(plate: string): Promise<boolean> {
  const { data } = await docsDb().from("docs_units_current").select("stock_state").eq("plate_no", normalizePlate(plate)).maybeSingle();
  return data?.stock_state === "Sold";
}

/** The record the handoff of this car is on, or the one it would go on; null when the car has no sale record yet. */
async function currentRow(plate: string): Promise<Row | null> {
  const { data } = await docsDb().from("car_transfers").select(COLS).eq("plate_no", normalizePlate(plate)).neq("stage", "cancelled");
  const rows = (data ?? []) as Row[];
  return latestOut(rows) ?? newest(rows) ?? null;
}

export async function handoffOf(plate: string): Promise<HandoffInfo | null> {
  const r = await currentRow(plate);
  return r ? infoOf(r) : null;
}

/** Every car that has a handoff: its latest one. For the lists (the stage of each car, the cars with the documents out, the reminders). */
export async function handoffMap(): Promise<Map<string, HandoffInfo>> {
  const out = new Map<string, Row>();
  for (let p = 0; ; p++) {
    const { data, error } = await docsDb().from("car_transfers").select(COLS).not("handed_off_at", "is", null).neq("stage", "cancelled").range(p * 1000, p * 1000 + 999);
    if (error) throw new Error(`The handoffs could not be read: ${error.message}`);
    for (const r of (data ?? []) as Row[]) { const have = out.get(r.plate_no); if (!have || r.handed_off_at! > have.handed_off_at!) out.set(r.plate_no, r); }
    if ((data ?? []).length < 1000) break;
  }
  return new Map([...out].map(([k, r]) => [k, infoOf(r)]));
}

/** The record to write on: the one already out, else the car's latest sale; a sold car with no record gets one. */
async function target(plate: string, actor: string): Promise<Row> {
  const key = normalizePlate(plate);
  const have = await currentRow(key);
  if (have) return have;
  const db = docsDb();
  const { data: unit } = await db.from("docs_units").select("id").eq("plate_no", key).is("archived_at", null).order("arrival_date", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  const { data, error } = await db.from("car_transfers").insert({ plate_no: key, unit_id: unit?.id ?? null, source: "app", stage: "in_process", flags: [NO_SALE_DETAILS], created_by: actor, updated_by: actor }).select(COLS).single();
  if (error || !data) throw new Error(`The transfer record could not be made: ${error?.message ?? "unknown"}`);
  return data as Row;
}

const save = async (id: string, patch: Record<string, unknown>, actor: string) => {
  const { error } = await docsDb().from("car_transfers").update({ ...patch, updated_by: actor, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`Could not save: ${error.message}`);
};
const datesOf = (r: Row): StepDates => ({ handedOffAt: r.handed_off_at, backAt: r.back_at, releasedOn: r.released_on, deliveredOn: r.delivered_on });

/** The originals are sent to the liaison. */
export async function sendOut(plate: string, note: string, checked: string[], actor: string, receiver: string): Promise<void> {
  const r = await target(plate, actor);
  const now = new Date().toISOString();
  await save(r.id, { handed_off_at: now, handed_off_by: actor, handoff_note: note.trim().slice(0, 300) || null, handoff_checked: checked, back_at: null, back_by: null, released_on: null, delivered_on: null, done_on: null, stage: "in_process", last_reminded_at: now, originals_at: receiver ? `with ${receiver}` : null }, actor);
}
/** The originals are back at MAD with the new CR. */
export async function markBack(plate: string, actor: string): Promise<void> {
  const r = await target(plate, actor);
  await save(r.id, { back_at: new Date().toISOString(), back_by: actor, stage: "transferred", originals_at: "on hand at MAD" }, actor);
}
/** Given to the buyer or to the financing company. */
export async function release(plate: string, to: string, on: string, actor: string): Promise<void> {
  const r = await target(plate, actor);
  const who = to.trim().slice(0, 70);
  await save(r.id, { released_on: on, stage: "released", next_step: who ? `Released to ${who} on ${on}` : `Released on ${on}`, ...(who ? { originals_at: `with ${who}` } : {}) }, actor);
}
/** The buyer or the bank confirmed they have it: the transfer is finished. */
export async function deliver(plate: string, on: string, actor: string): Promise<void> {
  const r = await target(plate, actor);
  await save(r.id, { delivered_on: on, done_on: on, stage: "delivered" }, actor);
}
/** The ticks and the note of a handoff (the papers checked against the folder). */
export async function setChecked(plate: string, keys: string[], actor: string): Promise<void> {
  const r = await target(plate, actor);
  await save(r.id, { handoff_checked: [...new Set(keys.filter((k) => typeof k === "string" && k.length < 60))].slice(0, 40) }, actor);
}
/** Admin: correct a handoff already made. */
export async function adminChange(plate: string, change: { kind: "edit"; note: string; checked: string[] } | { kind: "reopen" } | { kind: "undo" } | { kind: "step-back" }, actor: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await currentRow(plate);
  if (!r || !r.handed_off_at) return { ok: false, error: "These documents were not handed off." };
  switch (change.kind) {
    case "edit": await save(r.id, { handoff_note: change.note.trim().slice(0, 300) || null, handoff_checked: [...new Set(change.checked.filter((k) => k.length < 60))].slice(0, 40) }, actor); break;
    case "reopen":
      if (!r.back_at) return { ok: false, error: "These documents are not marked as back." };
      await save(r.id, { back_at: null, back_by: null, released_on: null, delivered_on: null, done_on: null, stage: "in_process", last_reminded_at: new Date().toISOString() }, actor); break;
    case "undo": await save(r.id, { handed_off_at: null, handed_off_by: null, handoff_note: null, handoff_checked: [], back_at: null, back_by: null, released_on: null, delivered_on: null, done_on: null, stage: "in_process", last_reminded_at: null }, actor); break;
    case "step-back": {
      const d = stepBack(datesOf(r));
      await save(r.id, { handed_off_at: d.handedOffAt, back_at: d.backAt, released_on: d.releasedOn, delivered_on: d.deliveredOn, done_on: d.deliveredOn, stage: stageFor(d), ...(d.backAt ? {} : { back_by: null }) }, actor);
      break;
    }
  }
  return { ok: true };
}

/** The cars whose originals are out, for the list and the reminder. */
export async function carsOut(): Promise<HandoffInfo[]> {
  return [...(await handoffMap()).values()].filter((h) => h.handedOffAt && !h.backAt).sort((a, b) => a.handedOffAt!.localeCompare(b.handedOffAt!));
}
export async function stampReminded(transferIds: string[], at: string): Promise<void> {
  if (transferIds.length) await docsDb().from("car_transfers").update({ last_reminded_at: at }).in("id", transferIds);
}
