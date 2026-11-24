import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

const docsDb = (): SupabaseClient => createAdminClient() as unknown as SupabaseClient; // the car records are newer than the generated types

/** What the import keeps on a review item for a sold list row whose plate could not be used: the record to make, once the plate is known. */
export interface SoldRowPayload {
  rowKey: string;                           // "sold|transfer tab|112": makes the item appear once
  keyParts: { tab: string; date: string | null; buyer: string };
  fields: Record<string, unknown>;          // the car_sales columns (without the plate, the car and the key)
  fillUnit: Record<string, string>;         // the chassis and engine, for the car when it has none
}

/** A person typed the plate of a sold list row: the sale is recorded, linked to the car when MAD has it. */
export async function createSaleFromRow(payload: SoldRowPayload, plate: string, actor: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = docsDb();
  const key = `${payload.keyParts.tab === "transfer tab" ? "ft" : "s26"}|${plate}|${payload.keyParts.date ?? payload.rowKey}|${payload.keyParts.buyer}`;
  const { data: dup } = await db.from("car_sales").select("id").eq("source_key", key).maybeSingle();
  if (dup) return { ok: false, message: "This sale is already recorded." };
  const { data: unit } = await db.from("docs_units").select("id, chassis_no, engine_no").eq("plate_no", plate).is("archived_at", null).order("arrival_date", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  const flags = [...((payload.fields.flags as string[] | undefined) ?? []).filter((f) => !f.startsWith("plate:")), `the plate ${plate} was typed by a person: check it against the OR/CR`];
  const { error } = await db.from("car_sales").insert({ ...payload.fields, flags, plate_no: plate, unit_id: unit?.id ?? null, source_key: key, source: "import", created_by: actor, updated_by: actor });
  if (error) return { ok: false, message: `Could not record the sale: ${error.message}` };
  if (unit) {
    const patch: Record<string, string> = {};
    if (!unit.chassis_no && payload.fillUnit.chassis_no) patch.chassis_no = payload.fillUnit.chassis_no;
    if (!unit.engine_no && payload.fillUnit.engine_no) patch.engine_no = payload.fillUnit.engine_no;
    if (Object.keys(patch).length) await db.from("docs_units").update({ ...patch, updated_by: actor, last_change_source: "sold-import" }).eq("id", unit.id);
  }
  return { ok: true };
}
