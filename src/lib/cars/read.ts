import "server-only";
import { manilaToday } from "@/lib/dates";
import { cleanDetails } from "@/lib/docs/details";
import { docsDb } from "@/lib/docsbible/review-server";
import { carRowOf, type CarFacts, type StockFacts } from "./from-db";
import type { CarRow } from "./model";

// Car status reads the app's own database: the price list (stock rows) joined with each car's record. No Google sheet is involved.

/** Where the ORCR WITH MAD tab can still be opened (it stays in the old workbook for now). Optional: set ORCR_SHEET_URL to the tab's full address. */
export const orcrSheetUrl = () => process.env.ORCR_SHEET_URL?.trim() || null;

export interface CarsData { cars: CarRow[]; at: number }

export async function loadCars(): Promise<CarsData> {
  const db = docsDb();
  const { data: stock, error } = await db.from("car_stock").select("*").eq("in_stock", true).order("sort_order").limit(3000);
  if (error) throw new Error(`Car status could not be read: ${error.message}`);
  const list = (stock ?? []) as (StockFacts & { unit_id: string })[];
  const ids = list.map((s) => s.unit_id);
  const COLS = "id, plate_display, arrival_date, year_model, make, model_variant, color, mileage, trans, fuel, encumbrance, spare_key, body_type, or_expiry";
  // papers_with arrived with migration 38: until it is applied the list still works without it
  // papers_with arrived with migration 38 and the state with 39
  const readUnits = async () => {
    for (const extra of [", papers_with, stock_state, state_for, state_on", ", papers_with", ""]) { const cols: string = COLS + extra; const r = await db.from("docs_units").select(cols).in("id", ids).limit(3000); if (!r.error) return r; }
    return { data: [] as never[] };
  };
  const [units, details] = await Promise.all([
    ids.length ? readUnits() : { data: [] },
    list.length ? db.from("unit_details").select("plate_no, data").in("plate_no", list.map((s) => s.plate_no)).limit(3000) : { data: [] },
  ]);
  const unit = new Map(((units.data ?? []) as unknown as (CarFacts & { id: string })[]).map((u) => [u.id, u as CarFacts]));
  const about = new Map((details.data ?? []).map((d) => [d.plate_no as string, cleanDetails(d.data).spareKey]));
  const today = manilaToday();
  const cars: CarRow[] = [];
  for (const s of list) { const u = unit.get(s.unit_id); if (u) cars.push(carRowOf(s, u, today, about.get(s.plate_no))); }
  return { cars, at: Date.now() };
}
