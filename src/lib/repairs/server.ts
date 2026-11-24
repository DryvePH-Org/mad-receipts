import "server-only";
import { manilaToday } from "@/lib/dates";
import { docsDb } from "@/lib/docsbible/review-server";
import { appUrl, tell } from "@/lib/notify";
import { normalizePlate } from "@/lib/rules/plate";
import { appendNote, cleanItem, cleanStatus, dueDate, isOpen, PENDING_STATUS, REJECTED_STATUS, stateAfterRepairs, type Approval, type ItemInput, type Repair } from "./model";

const COLS = "id, key, unit_id, plate_no, ym, brand, vehicle, problem, happened_on, happened_raw, solution, supplier, company, est_timeline, due_on, status, approval, approved_by, approved_at, reject_reason, reported_by, created_at, can_display";

const rowOf = (r: Record<string, unknown>): Repair => ({
  id: r.id as string, key: (r.key as string | null) ?? null, unitId: (r.unit_id as string | null) ?? null, plate: r.plate_no as string, ym: (r.ym as string | null) ?? null, brand: (r.brand as string | null) ?? null,
  vehicle: (r.vehicle as string | null) ?? null, problem: (r.problem as string | null) ?? null, happenedOn: (r.happened_on as string | null) ?? null, happenedRaw: (r.happened_raw as string | null) ?? null,
  solution: (r.solution as string | null) ?? null, supplier: (r.supplier as string | null) ?? null, company: (r.company as string | null) ?? null, estTimeline: (r.est_timeline as string | null) ?? null,
  dueOn: (r.due_on as string | null) ?? null, status: (r.status as string | null) ?? null, approval: ((r.approval as Approval | null) ?? "approved"), approvedBy: (r.approved_by as string | null) ?? null,
  approvedAt: (r.approved_at as string | null) ?? null, rejectReason: (r.reject_reason as string | null) ?? null, reportedBy: (r.reported_by as string | null) ?? null, createdAt: r.created_at as string, canDisplay: r.can_display === true,
});

export interface Actor { name: string; userId?: string | null }

/** Every job, newest first. Empty when migration 42 is not applied yet. */
export async function loadRepairs(plate?: string): Promise<Repair[]> {
  let q = docsDb().from("car_repairs").select(COLS).order("created_at", { ascending: false }).limit(3000);
  if (plate) q = q.eq("plate_no", plate);
  const { data, error } = await q;
  return error ? [] : (data ?? []).map(rowOf);
}

async function event(repairId: string, kind: string, detail: string | null, by: Actor) {
  await docsDb().from("repair_events").insert({ repair_id: repairId, kind, detail, by_name: by.name, by_user: by.userId ?? null });
}

/** The car record of a plate (its latest arrival), if the plate is in MAD. */
async function carOf(plate: string): Promise<{ id: string; state: string | null } | null> {
  const { data } = await docsDb().from("docs_units").select("id, stock_state").eq("plate_no", plate).is("archived_at", null).order("arrival_date", { ascending: false, nullsFirst: false }).limit(1);
  const u = data?.[0];
  return u ? { id: u.id as string, state: (u.stock_state as string | null) ?? null } : null;
}

/** The car's one status follows its open jobs: an Onhand car with an open job is For repair; when the last one closes it is Onhand again. Reserved, sold or not-for-sale cars keep theirs. */
export async function syncCarRepairState(plate: string): Promise<string | null> {
  const db = docsDb();
  const car = await carOf(plate);
  if (!car) return null;
  const { data } = await db.from("car_repairs").select("status, approval, can_display").eq("plate_no", plate).eq("approval", "approved").limit(500);
  // only a job the car cannot be shown with takes it off the market; a display-OK job leaves it sellable
  const open = (data ?? []).filter((r) => r.can_display !== true && isOpen({ status: r.status as string | null, approval: "approved" })).length;
  const next = stateAfterRepairs(car.state, open);
  if (!next) return null;
  await db.from("docs_units").update({ stock_state: next, last_change_source: "repairs" }).eq("id", car.id);
  return next;
}

export interface ReportInput { plate: string; vehicle?: string; ym?: string; items: Partial<Record<keyof ItemInput, unknown>>[]; reportId?: string; reportedBy?: string; reportedTg?: number | null; source?: "bot" | "app"; draftId?: string }

/** A new report: one pending job per problem, waiting for an Approver. The same key twice is never made twice (the bot may send it again). */
export async function reportRepairs(input: ReportInput, by: Actor): Promise<{ ok: true; ids: string[]; plate: string; found: boolean } | { ok: false; error: string }> {
  const plate = normalizePlate(input.plate);
  if (!plate) return { ok: false, error: "The plate number is missing." };
  const items = input.items.map(cleanItem).filter((x): x is ItemInput => !!x).slice(0, 10);
  if (!items.length) return { ok: false, error: "There is no problem to report." };
  const db = docsDb();
  const car = await carOf(plate);
  const { data: info } = car ? await db.from("docs_units").select("year_model, make, model_variant").eq("id", car.id).maybeSingle() : { data: null };
  const reportId = input.reportId ?? `R${Date.now().toString(36)}`;
  const ids: string[] = [];
  for (const [i, it] of items.entries()) {
    const key = `${reportId}-${i + 1}`;
    const { data: had } = await db.from("car_repairs").select("id").eq("key", key).maybeSingle();
    if (had) { ids.push(had.id as string); continue; }
    const { data, error } = await db.from("car_repairs").insert({
      key, report_id: reportId, plate_no: plate, unit_id: car?.id ?? null, ym: (input.ym ?? (info?.year_model as string | undefined) ?? "") || null, brand: (info?.make as string | undefined) ?? null,
      vehicle: input.vehicle || [info?.make, info?.model_variant].filter(Boolean).join(" ") || null, problem: it.problem, happened_on: it.reportedOn ?? manilaToday(), solution: it.solution || null,
      supplier: it.supplier || null, company: it.company || null, est_timeline: it.estTimeline || null, due_on: dueDate(it.estTimeline), status: PENDING_STATUS, approval: "pending",
      reported_by: input.reportedBy ?? by.name, reported_tg: input.reportedTg ?? null, draft_id: input.draftId ?? null, source: input.source ?? "app", created_by: by.userId ?? null,
    }).select("id").single();
    if (error || !data) return { ok: false, error: `Could not save the report: ${error?.message ?? "unknown"}` };
    ids.push(data.id as string);
    await event(data.id as string, "reported", it.problem, by);
  }
  await tell({ category: "repair_waiting", dedupe: `repair:${reportId}`, text: `🔧 Repair report waiting for approval\n${plate}${input.vehicle ? ` · ${input.vehicle}` : ""}\n${items.map((x) => `• ${x.problem}`).join("\n")}\n${appUrl("/repairs")}` });
  return { ok: true, ids, plate, found: !!car };
}

/** An Approver approves or rejects every pending job of a report (or one job). The status of an approved job is the one the reporter chose (open by default). */
export async function decideRepairs(ids: string[], approve: boolean, reason: string, by: Actor, canDisplay = false): Promise<{ ok: true; changed: number } | { ok: false; error: string }> {
  const db = docsDb();
  if (!approve && !reason.trim()) return { ok: false, error: "Type the reason for rejecting." };
  const { data: jobs } = await db.from("car_repairs").select("id, plate_no, solution").in("id", ids).eq("approval", "pending");
  if (!jobs?.length) return { ok: false, error: "Nothing is waiting for a decision there (someone may have decided already)." };
  const today = manilaToday(), plates = new Set<string>();
  for (const j of jobs) {
    const patch = approve
      ? { approval: "approved", status: "IN PROGRESS", can_display: canDisplay, approved_by: by.name, approved_by_user: by.userId ?? null, approved_at: new Date().toISOString() }
      : { approval: "rejected", status: REJECTED_STATUS, approved_by: `Rejected by ${by.name}`, approved_by_user: by.userId ?? null, approved_at: new Date().toISOString(), reject_reason: reason.trim(), solution: appendNote(j.solution as string | null, `Rejected: ${reason.trim()}`, today) };
    const { error } = await db.from("car_repairs").update(patch).eq("id", j.id as string).eq("approval", "pending");
    if (error) return { ok: false, error: `Could not save: ${error.message}` };
    await event(j.id as string, approve ? "approved" : "rejected", approve ? null : reason.trim(), by);
    plates.add(j.plate_no as string);
  }
  if (approve) for (const p of plates) await syncCarRepairState(p);
  return { ok: true, changed: jobs.length };
}

export interface RepairUpdate { canDisplay?: boolean; status?: string; estTimeline?: string; supplier?: string; company?: string; note?: string }

/** News about an approved job: done, a new date, a name, a note. Only what is given changes; a note goes after the solution, never over it. */
export async function updateRepair(id: string, u: RepairUpdate, by: Actor): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = docsDb();
  const { data: job } = await db.from("car_repairs").select("id, plate_no, solution, approval").eq("id", id).maybeSingle();
  if (!job) return { ok: false, error: "That job was not found." };
  if (job.approval !== "approved") return { ok: false, error: "A job can be updated after it is approved." };
  const patch: Record<string, unknown> = {};
  if (u.status !== undefined) { const s = cleanStatus(u.status); if (!s) return { ok: false, error: "That status is not one of the known words." }; patch.status = s; }
  if (u.estTimeline !== undefined) { patch.est_timeline = u.estTimeline.trim().slice(0, 40) || null; patch.due_on = dueDate(u.estTimeline); }
  if (u.canDisplay !== undefined) patch.can_display = u.canDisplay;
  if (u.supplier !== undefined) patch.supplier = u.supplier.trim().slice(0, 100) || null;
  if (u.company !== undefined) patch.company = u.company.trim().slice(0, 100) || null;
  if (u.note?.trim()) patch.solution = appendNote(job.solution as string | null, u.note, manilaToday());
  if (!Object.keys(patch).length) return { ok: false, error: "Nothing to change." };
  const { error } = await db.from("car_repairs").update(patch).eq("id", id);
  if (error) return { ok: false, error: `Could not save: ${error.message}` };
  if (patch.status) await event(id, "status", String(patch.status), by);
  if ("est_timeline" in patch) await event(id, "timeline", String(patch.est_timeline ?? ""), by);
  if (u.note?.trim()) await event(id, "note", u.note.trim(), by);
  if (patch.supplier !== undefined || patch.company !== undefined) await event(id, "edited", [u.supplier && `supplier ${u.supplier}`, u.company && `company ${u.company}`].filter(Boolean).join(", "), by);
  if ("can_display" in patch) await event(id, "display", u.canDisplay ? "can be displayed" : "cannot be displayed", by);
  if (patch.status || "can_display" in patch) await syncCarRepairState(job.plate_no as string);
  return { ok: true };
}
