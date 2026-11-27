import "server-only";
import { manilaToday } from "@/lib/dates";
import { docsDb } from "@/lib/docsbible/review-server";
import { awaitsPrice } from "./awaiting";
import { carRowOf, type CarFacts, type StockFacts } from "./from-db";
import type { CarRow } from "./model";

// Car Inventory reads the app's own database: the price list (stock rows) joined with each car's record. No Google sheet is involved.

/** Where the ORCR WITH MAD tab can still be opened (it stays in the old workbook for now). Optional: set ORCR_SHEET_URL to the tab's full address. */
export const orcrSheetUrl = () => process.env.ORCR_SHEET_URL?.trim() || null;

export interface CarsData { cars: CarRow[]; at: number }

/** The columns of the car record that the sale list adds (migration 40). */
export const STOCK_COLS = "body_group, stock_order, agreed_price, list_price, target_price, reprice, retarget, tools, location, stock_note";
const CAR_COLS = "id, in_stock, plate_no, plate_display, arrival_date, year_model, make, model_variant, color, mileage, trans, fuel, encumbrance, spare_key, body_type, buying_source, or_expiry, papers_with, stock_state, state_for, state_on";

export async function loadCars(): Promise<CarsData> {
  const db = docsDb();
  const read = (stock: string) => db.from("docs_units_current").select(`${CAR_COLS}, ${stock}`).order("in_stock", { ascending: false }).order("stock_order").limit(5000);
  // every car of the register (the latest arrival of each plate), the ones on the sale list first; cars that were sold stay for reference
  let { data, error } = await read(STOCK_COLS);
  // before migration 77 is applied there is no agreed_price column: the list is read without it, so the page works either way
  if (error && /agreed_price/.test(error.message)) ({ data, error } = await read(STOCK_COLS.replace("agreed_price, ", "")));
  if (error) throw new Error(`Car Inventory could not be read: ${error.message}`);
  // a car with no price yet is not in the inventory: it waits in "New cars to price" until an Admin sets its price
  const rows = ((data ?? []) as unknown as (CarFacts & StockFacts & { id: string; stock_note: string | null })[]).filter((r) => !awaitsPrice(r));
  // the price agreed with the buyer, from the car's latest sale record, for a car that is reserved or sold
  const { data: sales } = await db.from("car_sales").select("plate_no, agreed_price, sold_on").neq("stage", "cancelled").eq("is_reference", false).not("agreed_price", "is", null).order("sold_on", { ascending: false, nullsFirst: false }).limit(8000);
  const agreed = new Map<string, number>();
  for (const x of sales ?? []) if (!agreed.has(x.plate_no as string)) agreed.set(x.plate_no as string, Number(x.agreed_price));
  const today = manilaToday();
  const cars: CarRow[] = rows.map((r) => carRowOf({ ...r, remarks: r.stock_note, repair_status: null }, r, today, { agreedPrice: agreed.get(r.plate_no) ?? null }));
  return { cars, at: Date.now() };
}

export interface AwaitingCar { plate: string; plateDisplay: string; unitId: string; year: string; make: string; model: string; color: string; mileage: string; arrived: string | null }

/** The cars that have no price yet, the newest first. */
export async function loadAwaitingPrice(): Promise<AwaitingCar[]> {
  const { data, error } = await docsDb().from("docs_units_current").select("id, plate_no, plate_display, year_model, make, model_variant, color, mileage, arrival_date, in_stock, stock_state, list_price, reprice").eq("in_stock", true).order("arrival_date", { ascending: false, nullsFirst: false }).limit(5000);
  if (error) throw new Error(`The new cars could not be read: ${error.message}`);
  return ((data ?? []) as unknown as Record<string, string | null>[]).filter((r) => awaitsPrice(r)).map((r) => ({
    plate: r.plate_no as string, plateDisplay: (r.plate_display ?? r.plate_no) as string, unitId: r.id as string, year: r.year_model ?? "", make: r.make ?? "", model: r.model_variant ?? "", color: r.color ?? "", mileage: r.mileage ?? "", arrived: r.arrival_date,
  }));
}

/**
 * How many cars wait for a price (the number beside the menu entry, read on every page, so it is cheap): one count, no rows, and the answer is kept for 30 seconds.
 * The rule is the same as `awaitsPrice` (on the sale list, ready, no price and no reprice).
 */
export async function countAwaitingPrice(): Promise<number> {
  if (awaitingCount && Date.now() - awaitingCount.at < 30_000) return awaitingCount.n;
  const { count, error } = await docsDb().from("docs_units_current").select("id", { count: "exact", head: true }).eq("in_stock", true)
    .or("stock_state.is.null,stock_state.eq.Onhand").or("list_price.is.null,list_price.lte.0").or("reprice.is.null,reprice.lte.0");
  if (error) return awaitingCount?.n ?? 0;
  awaitingCount = { at: Date.now(), n: count ?? 0 };
  return awaitingCount.n;
}

let awaitingCount: { at: number; n: number } | null = null;
/** Forgets the saved number of cars waiting for a price (after one was priced), so the menu shows the new number at once. */
export const forgetAwaitingCount = () => { awaitingCount = null; };
