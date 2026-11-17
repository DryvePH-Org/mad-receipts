import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { manilaToday } from "@/lib/dates";
import { fetchText, SheetError, withFallback } from "@/lib/dashboard/sheets";
import { parseCsv } from "@/lib/dashboard/parse";
import { parseInventoryRows, type CarRow } from "./model";

// The inventory tab (INVENTORY 2026 of the MAD Pricelist), read as plain CSV: the sheet is shared "Anyone with the link can view", so no key
// and no bot are needed, and the answer is exact. The result is kept for a short while; "Refresh now" clears it.

export const CARS_TAG = "cars-status";
export const carsSheetId = () => process.env.CARS_SHEET_ID?.trim() || process.env.INVENTORY_SHEET_ID?.trim() || "";
/** The tab's numeric id (the gid in its address). The export by tab id is exact; the export by name garbles the header rows. */
export const carsSheetGid = () => process.env.CARS_SHEET_GID?.trim() || "84826590";
export const carsSheetUrl = () => `https://docs.google.com/spreadsheets/d/${carsSheetId()}/edit#gid=${carsSheetGid()}`;

export interface CarsData { cars: CarRow[]; at: number; stale: boolean }

export async function loadCars(): Promise<CarsData> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 120, expire: 3600 });
  cacheTag(CARS_TAG);
  const id = carsSheetId();
  if (!id) throw new SheetError("The inventory sheet is not set up on this server (CARS_SHEET_ID).");
  const r = await withFallback(`cars:${id}:${carsSheetGid()}`, async () => {
    const text = await fetchText(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${encodeURIComponent(carsSheetGid())}`);
    if (/^\s*<(!doctype|html)/i.test(text)) throw new SheetError('Could not read the inventory tab. Check that the sheet is shared as "Anyone with the link can view".');
    const cars = parseInventoryRows(parseCsv(text), manilaToday());
    if (cars.length === 0) throw new SheetError("No cars were found in the inventory tab. Check the tab and its header row.");
    return cars;
  });
  return { cars: r.value, at: r.at, stale: r.stale };
}
