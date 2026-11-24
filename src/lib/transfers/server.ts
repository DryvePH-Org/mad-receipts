import "server-only";
import { docsDb } from "@/lib/docsbible/review-server";
import { transferColumns, type Route, type Transfer, type TransferInput, type TransferStage } from "./model";

const COLS = "id, unit_id, plate_no, car_text, particular, financing, buyer, address, contact, cr_date, transaction_date, liaison, sales, balance, note, done_on, sold_on, agreed_price, route, stage, liaison_status, originals_at, next_step, chassis_no, engine_no, is_reference, flags, plate_original, deal_id, payment_status";

const rowOf = (r: Record<string, unknown>): Transfer => ({
  id: r.id as string, unitId: (r.unit_id as string | null) ?? null, plate: r.plate_no as string, carText: (r.car_text as string | null) ?? null, particular: (r.particular as string | null) ?? null,
  financing: (r.financing as string | null) ?? null, buyer: (r.buyer as string | null) ?? null, address: (r.address as string | null) ?? null, contact: (r.contact as string | null) ?? null,
  crDate: (r.cr_date as string | null) ?? null, transactionDate: (r.transaction_date as string | null) ?? null, liaison: (r.liaison as string | null) ?? null, sales: (r.sales as string | null) ?? null,
  balance: (r.balance as string | null) ?? null, note: (r.note as string | null) ?? null, doneOn: (r.done_on as string | null) ?? null,
  soldOn: (r.sold_on as string | null) ?? null, agreedPrice: r.agreed_price === null || r.agreed_price === undefined ? null : Number(r.agreed_price), route: ((r.route as Route | null) ?? "unknown"),
  stage: ((r.stage as TransferStage | null) ?? "in_process"), liaisonStatus: (r.liaison_status as string | null) ?? null, originalsAt: (r.originals_at as string | null) ?? null,
  nextStep: (r.next_step as string | null) ?? null, chassisNo: (r.chassis_no as string | null) ?? null, engineNo: (r.engine_no as string | null) ?? null,
  isReference: !!r.is_reference, flags: (r.flags as string[] | null) ?? [], plateOriginal: (r.plate_original as string | null) ?? null,
  dealId: (r.deal_id as string | null) ?? null, dealNo: null,
  paymentStatus: ((r.payment_status as Transfer["paymentStatus"]) ?? null),
});

/** Every transfer (newest sale first), with the car's description where the car has a record. Empty when migration 41 is not applied yet. */
export async function loadTransfers(plate?: string): Promise<{ transfers: Transfer[]; cars: Map<string, string> }> {
  const db = docsDb();
  let q = db.from("car_sales").select(COLS).order("sold_on", { ascending: false, nullsFirst: false }).order("cr_date", { ascending: false, nullsFirst: false }).limit(3000);
  if (plate) q = q.eq("plate_no", plate);
  const { data, error } = await q;
  if (error) return { transfers: [], cars: new Map() };
  const transfers = (data ?? []).map(rowOf);
  const dealIds = [...new Set(transfers.map((t) => t.dealId).filter((x): x is string => !!x))];
  const { data: deals } = dealIds.length ? await db.from("deals").select("id, deal_no").in("id", dealIds) : { data: [] };
  const dealNo = new Map((deals ?? []).map((d) => [d.id as string, d.deal_no as string]));
  for (const t of transfers) t.dealNo = t.dealId ? dealNo.get(t.dealId) ?? null : null;
  const ids = [...new Set(transfers.map((t) => t.unitId).filter((x): x is string => !!x))];
  const { data: units } = ids.length ? await db.from("docs_units").select("id, year_model, make, model_variant").in("id", ids).limit(3000) : { data: [] };
  const cars = new Map((units ?? []).map((u) => [u.id as string, [u.year_model, u.make, u.model_variant].filter(Boolean).join(" ")]));
  return { transfers, cars };
}

export async function saveTransfer(id: string, input: TransferInput, actor: string): Promise<string | null> {
  // once a person changed a record here, a later import of the sold list never overwrites it
  const { error } = await docsDb().from("car_sales").update({ ...transferColumns(input), edited_in_app: true, updated_by: actor, updated_at: new Date().toISOString() }).eq("id", id);
  return error ? error.message : null;
}

/** "Checked": a person looked at what was flagged on this record. */
export async function markChecked(id: string, actor: string): Promise<string | null> {
  const { error } = await docsDb().from("car_sales").update({ flags: [], edited_in_app: true, updated_by: actor, updated_at: new Date().toISOString() }).eq("id", id);
  return error ? error.message : null;
}

/** A new transfer for a car of the record (or a plate that has none yet). */
export async function addTransfer(plate: string, input: TransferInput, actor: string): Promise<string | null> {
  const db = docsDb();
  const { data: unit } = await db.from("docs_units").select("id").eq("plate_no", plate).is("archived_at", null).order("arrival_date", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db.from("car_sales").insert({ ...transferColumns(input), plate_no: plate, unit_id: unit?.id ?? null, source: "app", created_by: actor || null, updated_by: actor || null });
  return error ? error.message : null;
}

/** The sale records a deal made, for the deal page (the stage of the transfer, and where to open it). */
export async function salesOfDeal(dealId: string): Promise<{ plate: string; stage: string; unitId: string | null }[]> {
  const { data } = await docsDb().from("car_sales").select("plate_no, stage, unit_id").eq("deal_id", dealId);
  return (data ?? []).map((r) => ({ plate: r.plate_no as string, stage: (r.stage as string) ?? "in_process", unitId: (r.unit_id as string | null) ?? null }));
}
