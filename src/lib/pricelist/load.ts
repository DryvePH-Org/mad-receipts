import "server-only";
import { docsDb } from "@/lib/docsbible/review-server";
import { composeRow, type StockRecord, type UnitRecord } from "./compose";
import type { DetailRow, PriceRow } from "./export";

import { STOCK_COLS } from "@/lib/cars/read";

const UNIT_COLS = `id, plate_no, plate_display, arrival_date, year_model, make, model_variant, color, mileage, trans, fuel, encumbrance, spare_key, classification, papers_with, registry_of_deeds, stock_state, state_for, state_on, or_expiry, or_expiry_raw, ${STOCK_COLS}`;

/** The price list as the database holds it: one row per car on the sale list (the car record carries the prices, location and notes) and its About-the-car answers. */
export async function loadPriceList(): Promise<{ rows: PriceRow[]; details: DetailRow[] }> {
  const db = docsDb();
  const cols: string = UNIT_COLS;
  const { data, error } = await db.from("docs_units").select(cols).eq("in_stock", true).is("archived_at", null).order("stock_order").limit(3000);
  if (error) throw new Error(`Could not read Car Inventory: ${error.message}`);
  const list = (data ?? []) as unknown as (UnitRecord & { plate_no: string; stock_order: number | string; stock_note: string | null })[];
  const ids = list.map((u) => u.id);
  const plates = list.map((u) => u.plate_no);
  const [complete, details] = await Promise.all([
    ids.length ? db.from("docs_complete").select("id, complete_docs").in("id", ids).limit(3000) : { data: [] },
    plates.length ? db.from("unit_details").select("plate_no, data").in("plate_no", plates).limit(3000) : { data: [] },
  ]);
  const done = new Map((complete.data ?? []).map((c) => [c.id as string, c.complete_docs as string | null]));
  const about = new Map((details.data ?? []).map((d) => [d.plate_no as string, d.data]));
  const rows: PriceRow[] = [], out: DetailRow[] = [];
  for (const u of list) {
    const stock = { ...u, unit_id: u.id, sort_order: u.stock_order, remarks: u.stock_note, repair_status: null } as unknown as StockRecord;
    const c = composeRow(stock, u, about.get(u.plate_no), done.get(u.id) ?? null);
    rows.push(c.price); out.push(c.detail);
  }
  return { rows, details: out };
}
