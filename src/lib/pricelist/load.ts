import "server-only";
import { docsDb } from "@/lib/docsbible/review-server";
import { composeRow, type StockRecord, type UnitRecord } from "./compose";
import type { DetailRow, PriceRow } from "./export";

/** The price list as the database holds it: the stock row (prices, location, notes) joined with the car's Docs Bible row and its About-the-car answers. */
export async function loadPriceList(): Promise<{ rows: PriceRow[]; details: DetailRow[] }> {
  const db = docsDb();
  const { data: stock, error } = await db.from("car_stock").select("*").eq("in_stock", true).order("sort_order").limit(3000);
  if (error) throw new Error(`Could not read Car status: ${error.message}`);
  const list = (stock ?? []) as StockRecord[];
  const ids = list.map((s) => s.unit_id);
  const plates = list.map((s) => s.plate_no);
  const [units, complete, details] = await Promise.all([
    ids.length ? db.from("docs_units").select("id, plate_display, arrival_date, year_model, make, model_variant, color, mileage, trans, fuel, encumbrance, spare_key, classification").in("id", ids).limit(3000) : { data: [] },
    ids.length ? db.from("docs_complete").select("id, complete_docs").in("id", ids).limit(3000) : { data: [] },
    plates.length ? db.from("unit_details").select("plate_no, data").in("plate_no", plates).limit(3000) : { data: [] },
  ]);
  const unit = new Map((units.data ?? []).map((u) => [u.id as string, u as UnitRecord]));
  const done = new Map((complete.data ?? []).map((c) => [c.id as string, c.complete_docs as string | null]));
  const about = new Map((details.data ?? []).map((d) => [d.plate_no as string, d.data]));
  const rows: PriceRow[] = [], out: DetailRow[] = [];
  for (const s of list) {
    const u = unit.get(s.unit_id);
    if (!u) continue;
    const c = composeRow(s, u, about.get(s.plate_no), done.get(s.unit_id) ?? null);
    rows.push(c.price); out.push(c.detail);
  }
  return { rows, details: out };
}
