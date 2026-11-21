import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { colLetter, planImport, type Cell, type Snapshot } from "./import";
import { createSaleFromRow, type SoldRowPayload } from "@/lib/sold/server";
import { planResolution, type ReviewAction, type ReviewKind, type UnitLite } from "./review";

/** The docs_* tables are newer than the generated database types, so this client is untyped (the shapes are checked where they are read). */
type Admin = SupabaseClient;
export const docsDb = (): Admin => createAdminClient() as unknown as Admin;

export interface ReviewRow {
  id: string; kind: ReviewKind; plate: string | null; message: string; sourceRow: number | null; status: "open" | "resolved" | "dismissed"; decision: string | null; resolvedAt: string | null;
  units: (UnitLite & { make: string | null; model_variant: string | null; color: string | null; year_model: string | null; source_row: number | null; archived: boolean })[];
}

const UNIT_COLS = "id, plate_no, plate_display, arrival_date, sale_status, vehicle_status, classification, make, model_variant, color, year_model, source_row, archived_at";

export async function loadReview(admin: Admin = docsDb()): Promise<ReviewRow[]> {
  const { data: items, error } = await admin.from("docs_review_items").select("id, kind, plate_no, message, source_row, status, decision, resolved_at, unit_id").order("created_at").limit(2000);
  if (error) throw new Error(`Could not read the review list: ${error.message}`);
  const plates = [...new Set((items ?? []).map((i) => i.plate_no).filter((p): p is string => !!p))];
  const unitIds = [...new Set((items ?? []).map((i) => i.unit_id).filter((p): p is string => !!p))];
  const [byPlate, byId] = await Promise.all([
    plates.length ? admin.from("docs_units").select(UNIT_COLS).in("plate_no", plates) : { data: [] as never[] },
    unitIds.length ? admin.from("docs_units").select(UNIT_COLS).in("id", unitIds) : { data: [] as never[] },
  ]);
  const all = new Map<string, NonNullable<typeof byPlate.data>[number]>();
  for (const u of [...(byPlate.data ?? []), ...(byId.data ?? [])]) all.set(u.id, u);
  return (items ?? []).map((i) => {
    const mine = [...all.values()].filter((u) => (i.plate_no && u.plate_no === i.plate_no) || u.id === i.unit_id);
    return {
      id: i.id, kind: i.kind as ReviewKind, plate: i.plate_no, message: i.message, sourceRow: i.source_row, status: i.status as ReviewRow["status"], decision: i.decision, resolvedAt: i.resolved_at,
      units: mine.sort((a, b) => (a.source_row ?? 0) - (b.source_row ?? 0)).map((u) => ({ id: u.id, plate_no: u.plate_no, plate_display: u.plate_display, arrival_date: u.arrival_date, sale_status: u.sale_status, vehicle_status: u.vehicle_status, classification: u.classification, make: u.make, model_variant: u.model_variant, color: u.color, year_model: u.year_model, source_row: u.source_row, archived: !!u.archived_at })),
    };
  });
}

/** A row that had no plate becomes a car: its cells come from the raw archive of the import, read with the same rules as the import. */
async function unitFromRawRow(admin: Admin, runId: string, tab: string, row: number, plate: string) {
  const { data } = await admin.from("docs_import_cells").select("row_no, col_no, value, formula").eq("run_id", runId).eq("tab", tab).in("row_no", [1, row]);
  const cells: Cell[] = (data ?? []).map((c) => [c.row_no, c.col_no, c.value ?? "", (c.value ?? "").startsWith("#") ? "e" : "s", c.formula]);
  const head = cells.find((c) => c[0] === 1 && c[2].trim().toUpperCase() === "PLATE NO.");
  if (!head) throw new Error("The sheet's header was not kept: cannot rebuild this row.");
  cells.push([row, head[1], plate, "s", null]);
  const snap: Snapshot = { snapshot: "review", sha256: "", takenAt: "", tabs: { [tab]: { hidden: false, maxRow: row, maxCol: Math.max(...cells.map((c) => c[1])), cells } } };
  const plan = planImport(snap, { docsTab: tab });
  const unit = plan.units.find((u) => u.sourceRow === row);
  if (!unit) throw new Error("The row could not be rebuilt.");
  return { unit, label: colLetter(head[1]) };
}

export async function resolveReview(itemId: string, action: ReviewAction, actor: string, admin: Admin = docsDb()): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const { data: item } = await admin.from("docs_review_items").select("id, kind, status, unit_id, plate_no, source_row, import_run_id, payload").eq("id", itemId).maybeSingle();
  if (!item) return { ok: false, message: "That item is not there any more." };
  if (item.status !== "open") return { ok: false, message: "This item was already settled." };
  let unit: UnitLite | null = null;
  if (item.unit_id) { const { data } = await admin.from("docs_units").select("id, plate_no, plate_display, arrival_date, sale_status, vehicle_status, classification").eq("id", item.unit_id).maybeSingle(); unit = data; }
  const plan = planResolution(item.kind as ReviewKind, unit, action);
  if ("error" in plan) return { ok: false, message: plan.error };

  const stamp = { updated_by: actor, last_change_source: "review" };
  if (plan.patch) { const r = await admin.from("docs_units").update({ ...plan.patch.fields, ...stamp }).eq("id", plan.patch.unitId); if (r.error) return { ok: false, message: `Could not save: ${r.error.message}` }; }
  if (plan.createSale) {
    if (!item.payload) return { ok: false, message: "This row's details were not kept." };
    const sale = await createSaleFromRow(item.payload as SoldRowPayload, plan.createSale.plate, actor);
    if (!sale.ok) return { ok: false, message: sale.message };
  }
  if (plan.archive) { const r = await admin.from("docs_units").update({ archived_at: new Date().toISOString(), archived_by: actor, ...stamp }).eq("id", plan.archive); if (r.error) return { ok: false, message: `Could not save: ${r.error.message}` }; }
  if (plan.createFromRow) {
    if (!item.source_row || !item.import_run_id) return { ok: false, message: "This row's source was not kept." };
    const { unit: built } = await unitFromRawRow(admin, item.import_run_id, "DOCS 2026", item.source_row, plan.createFromRow.plate);
    const r = await admin.from("docs_units").insert({ plate_no: built.plate_no, plate_display: built.plate_display, arrival_date: built.arrival_date, arrival_raw: built.arrival_raw, ...built.fields, source: "import", last_change_source: "review", import_run_id: item.import_run_id, source_row: built.sourceRow, raw: built.raw, created_by: actor, updated_by: actor }).select("id").single();
    if (r.error) return { ok: false, message: `Could not add the car: ${r.error.message}` };
    await admin.from("docs_review_items").update({ unit_id: r.data.id, plate_no: built.plate_no }).eq("id", itemId);
  }
  const done = await admin.from("docs_review_items").update({ status: plan.recordOnly ? "dismissed" : "resolved", decision: plan.decision, resolved_by: actor, resolved_at: new Date().toISOString() }).eq("id", itemId);
  if (done.error) return { ok: false, message: `Saved, but the item could not be closed: ${done.error.message}` };
  return { ok: true, message: plan.decision };
}
