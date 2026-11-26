"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModule } from "@/lib/auth";
import { docsDb } from "@/lib/docsbible/review-server";

export type PriceResult = { ok: true; message: string } | { ok: false; error: string };

const price = z.number().int().min(1).max(99_999_999);
const input = z.object({ plate: z.string().min(5).max(20), listPrice: price, targetPrice: z.union([price, z.null()]) });

/** The first price of a new car: the car goes into Car Inventory as soon as it has one. Admin and Super Admin. The price history is kept by the database. */
export async function setFirstPriceAction(raw: z.input<typeof input>): Promise<PriceResult> {
  const user = await requireModule("pricing");
  const p = input.safeParse(raw);
  if (!p.success) return { ok: false, error: "Type the price as whole pesos, like 458,000." };
  const v = p.data, plate = v.plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (v.targetPrice !== null && v.targetPrice > v.listPrice) return { ok: false, error: "The lowest price we would take cannot be higher than the price." };
  const db = docsDb();
  const { data: row } = await db.from("docs_units").select("id, list_price, reprice, stock_state").eq("plate_no", plate).eq("in_stock", true).is("archived_at", null).maybeSingle();
  if (!row) return { ok: false, error: "That car is not on the stock list." };
  if (Number(row.list_price) > 0 || Number(row.reprice) > 0) return { ok: false, error: "That car already has a price." };
  const { error } = await db.from("docs_units").update({ list_price: v.listPrice, target_price: v.targetPrice, updated_by: user.id, last_change_source: "app" }).eq("id", row.id as string);
  if (error) return { ok: false, error: `Could not save: ${error.message}` };
  revalidatePath("/", "layout");
  return { ok: true, message: `${plate} is priced and now in Car Inventory.` };
}
