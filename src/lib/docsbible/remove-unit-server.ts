import "server-only";
import { normalizePlate } from "@/lib/rules/plate";
import { docsDb } from "./review-server";

export type RemoveUnitResult = { ok: true; message: string } | { ok: false; message: string };

/**
 * An Admin takes a car out of MAD (a car entered by mistake, or twice). Nothing is destroyed: the car's rows are archived (they leave every list and
 * the sale list, and stay in the database with who removed them and when), its folder row and photo list are dropped from Car documents, and the
 * Drive folder itself is never touched. A car that has an AR cannot be removed: the receipts need it.
 */
export async function removeUnit(plate: string, actor: string): Promise<RemoveUnitResult> {
  const key = normalizePlate(plate);
  if (key.length < 5) return { ok: false, message: "Bad plate." };
  const db = docsDb();
  const { data: deals } = await db.from("deal_units").select("deal_id").eq("plate_no", key).limit(1);
  if (deals?.length) return { ok: false, message: "This car has an AR, so it cannot be removed. Cancel or correct the AR first." };
  const { data: units, error } = await db.from("docs_units").select("id").eq("plate_no", key).is("archived_at", null);
  if (error) return { ok: false, message: `Could not read the car: ${error.message}` };
  const { data: folder } = await db.from("unit_folders").select("plate_no").eq("plate_no", key).maybeSingle();
  if (!units?.length && !folder) return { ok: false, message: "This car is not in MAD." };
  if (units?.length) {
    const r = await db.from("docs_units").update({ archived_at: new Date().toISOString(), archived_by: actor, in_stock: false, updated_by: actor, last_change_source: "removed" }).in("id", units.map((u) => u.id));
    if (r.error) return { ok: false, message: `Could not remove the car: ${r.error.message}` };
  }
  if (folder) {
    const r = await db.from("unit_folders").delete().eq("plate_no", key);
    if (r.error) return { ok: false, message: `The car was removed, but its folder row could not be dropped: ${r.error.message}` };
  }
  await db.from("unit_workflow").delete().eq("plate_no", key);
  await db.from("audit_logs").insert({ actor_id: actor, action: "unit.remove", entity: "docs_unit", entity_id: null, after: { plate: key, units: units?.length ?? 0, hadFolder: !!folder } });
  return { ok: true, message: `${key} was removed from MAD. Its Drive folder was not touched.` };
}
