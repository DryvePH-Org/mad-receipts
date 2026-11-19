"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { docsDb } from "@/lib/docsbible/review-server";
import { formatStatusText } from "@/lib/inventory/remarks";
import { manilaToday } from "@/lib/dates";

export type StockResult = { ok: true; message: string } | { ok: false; error: string };

const price = z.union([z.number().int().min(0).max(99_999_999), z.null()]);
const input = z.object({
  plate: z.string().min(5).max(20),
  listPrice: price, targetPrice: price, reprice: price, retarget: price,
  state: z.enum(["Onhand", "Reserved", "Sold", "Not for sale", "For repair", "Sell as is", "Shipped to Cebu"]),
  person: z.string().max(60), note: z.string().max(280), location: z.string().max(60), tools: z.string().max(120),
});
export type StockInput = z.infer<typeof input>;

const clean = (v: string) => v.replace(/\s+/g, " ").trim();
const sheetDay = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

/** Admin and Approver change a car of the price list: prices, where it is, its state and its notes. The price history is kept by the database. */
export async function updateStockAction(raw: StockInput): Promise<StockResult> {
  const user = await requireRole("admin", "approver");
  const p = input.safeParse(raw);
  if (!p.success) return { ok: false, error: "Some of the values are not valid. Prices are whole pesos." };
  const v = p.data, plate = v.plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const db = docsDb();
  const { data: row } = await db.from("car_stock").select("unit_id, remarks").eq("plate_no", plate).eq("in_stock", true).maybeSingle();
  if (!row) return { ok: false, error: "That car is not on the stock list." };
  const note = clean(v.note) || null;
  const reservedOrSold = v.state === "Reserved" || v.state === "Sold";
  if (reservedOrSold && !clean(v.person)) return { ok: false, error: `Type who the car is ${v.state === "Sold" ? "sold" : "reserved"} for.` };
  const stock = { list_price: v.listPrice, target_price: v.targetPrice, reprice: v.reprice, retarget: v.retarget, location: clean(v.location) || null, tools: clean(v.tools) || null, updated_by: user.id };
  // the one status goes on the car's record (the two old status columns follow it); the stock row only keeps the note
  const unit = await db.from("docs_units").update({ stock_state: v.state, state_for: reservedOrSold ? clean(v.person).toUpperCase() : null, state_on: reservedOrSold ? manilaToday() : null, updated_by: user.id, last_change_source: "app" }).eq("id", row.unit_id as string);
  let error;
  if (!unit.error) ({ error } = await db.from("car_stock").update({ ...stock, remarks: note, repair_status: null }).eq("unit_id", row.unit_id as string));
  else if (/stock_state|state_for|state_on/.test(unit.error.message)) {
    // before migration 39: the status goes in the note and the repair state, as it used to
    const status = reservedOrSold ? formatStatusText(v.state === "Sold" ? "Sold" : "Reserved", { receiptNo: "", people: [{ name: clean(v.person), percent: null }], date: sheetDay(manilaToday()) }) : "";
    ({ error } = await db.from("car_stock").update({ ...stock, remarks: [status, note].filter(Boolean).join(" | ") || null, repair_status: v.state === "For repair" ? "FOR REPAIR" : v.state === "Sell as is" ? "SELL AS IS" : null }).eq("unit_id", row.unit_id as string));
  } else return { ok: false, error: `Could not save: ${unit.error.message}` };
  if (error) return { ok: false, error: `Could not save: ${error.message}` };
  revalidatePath("/cars");
  return { ok: true, message: "Saved." };
}

/** The car leaves the price list (sold and handed over, or not for sale any more). Its row and history are kept. */
export async function takeOffStockAction(plateRaw: string): Promise<StockResult> {
  const user = await requireRole("admin", "approver");
  const plate = plateRaw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const { error } = await docsDb().from("car_stock").update({ in_stock: false, updated_by: user.id }).eq("plate_no", plate).eq("in_stock", true);
  if (error) return { ok: false, error: `Could not take it off: ${error.message}` };
  revalidatePath("/cars");
  return { ok: true, message: "Taken off the stock list." };
}
