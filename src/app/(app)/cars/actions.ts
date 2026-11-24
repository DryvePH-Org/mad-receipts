"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin, requireRole } from "@/lib/auth";
import { DETAIL_FIELDS, FIELD_BY_KEY, type DetailKey as FieldKey } from "@/lib/cars/standards";
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

// ---------------- the car's details: one format for every car ----------------

export type DetailsResult = { ok: true; message: string } | { ok: false; error: string; fields?: Partial<Record<FieldKey, string>> };

/** The values of the details form, tidied and checked against the standard of each field. Empty is allowed (the detail is cleared). */
function checkDetails(raw: Partial<Record<FieldKey, string>>): { values: Partial<Record<FieldKey, string | null>>; errors: Partial<Record<FieldKey, string>> } {
  const values: Partial<Record<FieldKey, string | null>> = {}, errors: Partial<Record<FieldKey, string>> = {};
  for (const key of DETAIL_FIELDS) {
    if (!(key in raw)) continue;
    const c = FIELD_BY_KEY.get(key)!.check(String(raw[key] ?? "").slice(0, 200));
    if (c.ok) values[key] = c.value; else errors[key] = c.error;
  }
  return { values, errors };
}

/** The Admins change the details of a car (year, make, model, color, body type, transmission, fuel, mileage, spare key). Each value follows its standard format. */
export async function updateCarDetailsAction(plateRaw: string, raw: Partial<Record<FieldKey, string>>): Promise<DetailsResult> {
  const user = await requireAdmin();
  const plate = plateRaw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (plate.length < 5) return { ok: false, error: "That car was not found." };
  const { values, errors } = checkDetails(raw);
  if (Object.keys(errors).length) return { ok: false, error: Object.values(errors)[0]!, fields: errors };
  if (!Object.keys(values).length) return { ok: false, error: "Nothing to change." };
  const { error } = await docsDb().from("docs_units").update({ ...values, updated_by: user.id, last_change_source: "app" }).eq("plate_no", plate).eq("in_stock", true).is("archived_at", null);
  if (error) return { ok: false, error: `Could not save: ${error.message}` };
  revalidatePath("/cars"); revalidatePath(`/documents/${plate}`); revalidatePath("/documents");
  return { ok: true, message: "The details are saved." };
}

const tidyItem = z.object({ unitId: z.string().uuid(), field: z.string(), value: z.string().max(200) });

/** The Admins approve the fixes of the Tidy up list: each value is checked again, then written to the car record (and the price list's copy is cleared). */
export async function applyTidyAction(raw: { unitId: string; field: string; value: string }[]): Promise<DetailsResult> {
  const user = await requireAdmin();
  const items = z.array(tidyItem).max(500).safeParse(raw);
  if (!items.success || !items.data.length) return { ok: false, error: "Nothing was chosen." };
  const byUnit = new Map<string, Partial<Record<FieldKey, string>>>();
  for (const it of items.data) {
    if (!(DETAIL_FIELDS as string[]).includes(it.field)) return { ok: false, error: "That field cannot be changed here." };
    byUnit.set(it.unitId, { ...(byUnit.get(it.unitId) ?? {}), [it.field]: it.value });
  }
  const db = docsDb();
  let done = 0;
  for (const [unitId, fields] of byUnit) {
    const { values, errors } = checkDetails(fields);
    if (Object.keys(errors).length) return { ok: false, error: Object.values(errors)[0]!, fields: errors };
    const { error } = await db.from("docs_units").update({ ...values, updated_by: user.id, last_change_source: "app" }).eq("id", unitId);
    if (error) return { ok: false, error: `Could not save: ${error.message}` };
    done += Object.keys(values).length;
  }
  revalidatePath("/cars"); revalidatePath("/cars/tidy"); revalidatePath("/documents");
  return { ok: true, message: `${done} ${done === 1 ? "value was" : "values were"} tidied.` };
}
