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
  state: z.enum(["available", "reserved", "sold", "repair", "asis"]),
  person: z.string().max(60), note: z.string().max(280), location: z.string().max(60), tools: z.string().max(120), papersWith: z.string().max(80),
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
  let remarks: string | null, repair: string | null;
  if (v.state === "reserved" || v.state === "sold") {
    if (!clean(v.person)) return { ok: false, error: `Type who the car is ${v.state === "sold" ? "sold" : "reserved"} for.` };
    const status = formatStatusText(v.state === "sold" ? "Sold" : "Reserved", { receiptNo: "", people: [{ name: clean(v.person), percent: null }], date: sheetDay(manilaToday()) });
    remarks = note ? `${status} | ${note}` : status;
    repair = null;
  } else { remarks = note; repair = v.state === "repair" ? "FOR REPAIR" : v.state === "asis" ? "SELL AS IS" : null; }
  const { error } = await db.from("car_stock").update({
    list_price: v.listPrice, target_price: v.targetPrice, reprice: v.reprice, retarget: v.retarget, location: clean(v.location) || null, tools: clean(v.tools) || null,
    papers_with: clean(v.papersWith) || null, remarks, repair_status: repair, updated_by: user.id,
  }).eq("unit_id", row.unit_id as string);
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
