import "server-only";
import { manilaToday } from "@/lib/dates";
import { docsDb } from "@/lib/docsbible/review-server";
import { carRowOf, type CarFacts, type StockFacts } from "./from-db";
import type { CarRow } from "./model";

// Car Inventory reads the app's own database: the price list (stock rows) joined with each car's record. No Google sheet is involved.

/** Where the ORCR WITH MAD tab can still be opened (it stays in the old workbook for now). Optional: set ORCR_SHEET_URL to the tab's full address. */
export const orcrSheetUrl = () => process.env.ORCR_SHEET_URL?.trim() || null;

export interface CarsData { cars: CarRow[]; at: number }

/** The columns of the car record that the sale list adds (migration 40). */
export const STOCK_COLS = "body_group, stock_order, list_price, target_price, reprice, retarget, tools, location, stock_note";
const CAR_COLS = "id, plate_no, plate_display, arrival_date, year_model, make, model_variant, color, mileage, trans, fuel, encumbrance, spare_key, body_type, buying_source, or_expiry, papers_with, stock_state, state_for, state_on";

export async function loadCars(): Promise<CarsData> {
  const db = docsDb();
  const cols: string = `${CAR_COLS}, ${STOCK_COLS}`;
  const { data, error } = await db.from("docs_units").select(cols).eq("in_stock", true).is("archived_at", null).order("stock_order").limit(3000);
  if (error) throw new Error(`Car Inventory could not be read: ${error.message}`);
  const rows = (data ?? []) as unknown as (CarFacts & StockFacts & { id: string; stock_note: string | null })[];
  const today = manilaToday();
  // one record: the sale list's fields and the car's own are the same row
  const cars: CarRow[] = rows.map((r) => carRowOf({ ...r, remarks: r.stock_note, repair_status: null }, r, today));
  return { cars, at: Date.now() };
}
