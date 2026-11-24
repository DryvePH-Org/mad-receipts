import "server-only";
import { docsDb } from "@/lib/docsbible/review-server";
import { findTidy, type TidyItem, type TidyRow } from "./tidy";

const COLS = "id, plate_no, plate_display, year_model, make, model_variant, color, body_type, trans, fuel, mileage, spare_key";

/** The values of the cars on the stock list that do not follow the standard formats, each with the fix that is suggested. */
export async function loadTidy(): Promise<TidyItem[]> {
  const { data, error } = await docsDb().from("docs_units").select(COLS).eq("in_stock", true).is("archived_at", null).order("stock_order").limit(3000);
  if (error) throw new Error(`The cars could not be read: ${error.message}`);
  return findTidy((data ?? []) as unknown as TidyRow[]);
}
