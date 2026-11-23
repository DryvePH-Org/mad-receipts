"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { docsDb } from "@/lib/docsbible/review-server";
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

/** Super Admin, Admin and Sales change a car of the price list: prices, where it is, its state and its notes. The price history is kept by the database. */
export async function updateStockAction(raw: StockInput): Promise<StockResult> {
  const user = await requireRole("super_admin", "admin", "sales");
  const p = input.safeParse(raw);
  if (!p.success) return { ok: false, error: "Some of the values are not valid. Prices are whole pesos." };
  const v = p.data, plate = v.plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const db = docsDb();
  const { data: row } = await db.from("docs_units").select("id").eq("plate_no", plate).eq("in_stock", true).is("archived_at", null).maybeSingle();
  if (!row) return { ok: false, error: "That car is not on the stock list." };
  const note = clean(v.note) || null;
  const reservedOrSold = v.state === "Reserved" || v.state === "Sold";
  if (reservedOrSold && !clean(v.person)) return { ok: false, error: `Type who the car is ${v.state === "Sold" ? "sold" : "reserved"} for.` };
  // one record: prices, place, tools, note and the one status are all fields of the car (the two old status columns follow the state)
  const { error } = await db.from("docs_units").update({
    list_price: v.listPrice, target_price: v.targetPrice, reprice: v.reprice, retarget: v.retarget, location: clean(v.location) || null, tools: clean(v.tools) || null, stock_note: note,
    stock_state: v.state, state_for: reservedOrSold ? clean(v.person).toUpperCase() : null, state_on: reservedOrSold ? manilaToday() : null, updated_by: user.id, last_change_source: "app",
  }).eq("id", row.id as string);
  if (error) return { ok: false, error: `Could not save: ${error.message}` };
  revalidatePath("/cars");
  return { ok: true, message: "Saved." };
}

/** The car leaves the price list (sold and handed over, or not for sale any more). Its row and history are kept. */
export async function takeOffStockAction(plateRaw: string): Promise<StockResult> {
  const user = await requireRole("super_admin", "admin", "sales");
  const plate = plateRaw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const { error } = await docsDb().from("docs_units").update({ in_stock: false, updated_by: user.id, last_change_source: "app" }).eq("plate_no", plate).eq("in_stock", true);
  if (error) return { ok: false, error: `Could not take it off: ${error.message}` };
  revalidatePath("/cars");
  return { ok: true, message: "Taken off the stock list." };
}
