import "server-only";
import { docsDb } from "@/lib/docsbible/review-server";
import { normalizePlate } from "@/lib/rules/plate";
import { applyStatus, readStatus } from "./remarks";
import type { InventoryAdapter, InventoryUnit } from "./types";

/** A problem staff can fix; the message is safe to show them. */
export class InventoryError extends Error {}

interface Joined { plate: string; remarks: string; makeType: string; year: string; color: string }

/**
 * The price list in the app's own database (no Google sheet): the stock row's status note (REMARKS) is the only thing written, and only its status
 * part: any other note in it is kept. A car that has a Docs Bible row but no stock row yet gets one when its first status is written.
 */
export function createDbInventory(): InventoryAdapter {
  const db = docsDb();

  async function joined(plates?: string[]): Promise<Joined[]> {
    let q = db.from("car_stock").select("unit_id, plate_no, remarks, list_model, list_color").eq("in_stock", true).limit(3000);
    if (plates) q = q.in("plate_no", plates);
    const { data: stock, error } = await q;
    if (error) throw new InventoryError(`The price list could not be read: ${error.message}`);
    const ids = (stock ?? []).map((s) => s.unit_id as string);
    const { data: units } = ids.length ? await db.from("docs_units").select("id, make, model_variant, year_model, color").in("id", ids).limit(3000) : { data: [] };
    const u = new Map((units ?? []).map((x) => [x.id as string, x]));
    return (stock ?? []).map((s) => {
      const c = u.get(s.unit_id as string);
      return { plate: s.plate_no as string, remarks: String(s.remarks ?? ""), makeType: [c?.make, (s.list_model as string | null) ?? c?.model_variant].filter(Boolean).join(" "), year: String(c?.year_model ?? ""), color: String((s.list_color as string | null) ?? c?.color ?? "") };
    });
  }
  const unitOf = (j: Joined): InventoryUnit => ({ plate: j.plate, status: readStatus(j.remarks), ...(j.remarks ? { remarks: j.remarks } : {}), ...(j.makeType ? { makeType: j.makeType } : {}), ...(j.year ? { year: j.year } : {}), ...(j.color ? { color: j.color } : {}) });

  return {
    async listUnits() { return (await joined()).map(unitOf); },

    async getUnit(plate) {
      const key = normalizePlate(plate);
      if (!key) return null;
      const [one] = await joined([key]);
      if (one) return unitOf(one);
      // a car of the Docs Bible that is not in the stock: enough to name it (a folder, a receipt)
      const { data: c } = await db.from("docs_units").select("make, model_variant, year_model, color").eq("plate_no", key).is("archived_at", null).order("arrival_date", { ascending: false }).limit(1);
      const u = c?.[0];
      if (!u) return null;
      const makeType = [u.make, u.model_variant].filter(Boolean).join(" ");
      return { plate: key, status: "Available", ...(makeType ? { makeType } : {}), ...(u.year_model ? { year: String(u.year_model) } : {}), ...(u.color ? { color: String(u.color) } : {}) };
    },

    async setStatus(plate, status, ref) {
      const key = normalizePlate(plate);
      const { data: row } = await db.from("car_stock").select("unit_id, remarks").eq("plate_no", key).eq("in_stock", true).maybeSingle();
      let unitId = row?.unit_id as string | undefined, current = String(row?.remarks ?? "");
      if (!unitId) {
        const { data: c } = await db.from("docs_units").select("id").eq("plate_no", key).is("archived_at", null).order("arrival_date", { ascending: false }).limit(1);
        if (!c?.[0]) throw new InventoryError(`Plate ${key} is not in the app's car list.`);
        const { data: last } = await db.from("car_stock").select("sort_order").order("sort_order", { ascending: false }).limit(1);
        const ins = await db.from("car_stock").upsert({ unit_id: c[0].id, plate_no: key, in_stock: true, source: "app", sort_order: Number(last?.[0]?.sort_order ?? 0) + 1 }, { onConflict: "unit_id" });
        if (ins.error) throw new InventoryError(`Could not put ${key} on the price list: ${ins.error.message}`);
        unitId = c[0].id as string; current = "";
      }
      const next = applyStatus(current, status, ref);
      if (next === current) return; // already says the right thing
      const { error } = await db.from("car_stock").update({ remarks: next }).eq("unit_id", unitId);
      if (error) throw new InventoryError(`Could not save the status of ${key}: ${error.message}`);
    },
  };
}
