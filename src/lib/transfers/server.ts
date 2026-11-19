import "server-only";
import { docsDb } from "@/lib/docsbible/review-server";
import { transferColumns, type Transfer, type TransferInput } from "./model";

const COLS = "id, unit_id, plate_no, car_text, particular, financing, buyer, address, contact, cr_date, transaction_date, liaison, sales, balance, note, done_on";

const rowOf = (r: Record<string, unknown>): Transfer => ({
  id: r.id as string, unitId: (r.unit_id as string | null) ?? null, plate: r.plate_no as string, carText: (r.car_text as string | null) ?? null, particular: (r.particular as string | null) ?? null,
  financing: (r.financing as string | null) ?? null, buyer: (r.buyer as string | null) ?? null, address: (r.address as string | null) ?? null, contact: (r.contact as string | null) ?? null,
  crDate: (r.cr_date as string | null) ?? null, transactionDate: (r.transaction_date as string | null) ?? null, liaison: (r.liaison as string | null) ?? null, sales: (r.sales as string | null) ?? null,
  balance: (r.balance as string | null) ?? null, note: (r.note as string | null) ?? null, doneOn: (r.done_on as string | null) ?? null,
});

/** Every transfer (newest CR date first), with the car's description where the car has a record. Empty when migration 41 is not applied yet. */
export async function loadTransfers(plate?: string): Promise<{ transfers: Transfer[]; cars: Map<string, string> }> {
  const db = docsDb();
  let q = db.from("car_transfers").select(COLS).order("cr_date", { ascending: false, nullsFirst: false }).limit(2000);
  if (plate) q = q.eq("plate_no", plate);
  const { data, error } = await q;
  if (error) return { transfers: [], cars: new Map() };
  const transfers = (data ?? []).map(rowOf);
  const ids = [...new Set(transfers.map((t) => t.unitId).filter((x): x is string => !!x))];
  const { data: units } = ids.length ? await db.from("docs_units").select("id, year_model, make, model_variant").in("id", ids).limit(3000) : { data: [] };
  const cars = new Map((units ?? []).map((u) => [u.id as string, [u.year_model, u.make, u.model_variant].filter(Boolean).join(" ")]));
  return { transfers, cars };
}

export async function saveTransfer(id: string, input: TransferInput, actor: string): Promise<string | null> {
  const { error } = await docsDb().from("car_transfers").update({ ...transferColumns(input), updated_by: actor, updated_at: new Date().toISOString() }).eq("id", id);
  return error ? error.message : null;
}

/** A new transfer for a car of the record (or a plate that has none yet). */
export async function addTransfer(plate: string, input: TransferInput, actor: string): Promise<string | null> {
  const db = docsDb();
  const { data: unit } = await db.from("docs_units").select("id").eq("plate_no", plate).is("archived_at", null).order("arrival_date", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db.from("car_transfers").insert({ ...transferColumns(input), plate_no: plate, unit_id: unit?.id ?? null, source: "app", created_by: actor, updated_by: actor });
  return error ? error.message : null;
}
