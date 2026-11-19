import "server-only";
import { noteOf } from "@/lib/cars/from-db";
import { dateOfMonthDay, remarksText, stateFromStockNote, type StockState } from "@/lib/cars/state";
import { manilaToday } from "@/lib/dates";
import { docsDb } from "@/lib/docsbible/review-server";
import { normalizePlate } from "@/lib/rules/plate";
import { applyStatus, readStatus } from "./remarks";
import type { InventoryAdapter, InventoryUnit } from "./types";

/** A problem staff can fix; the message is safe to show them. */
export class InventoryError extends Error {}

interface Joined { plate: string; unitId: string; remarks: string; makeType: string; year: string; color: string }

/**
 * The stock list in the app's own database. A car has ONE status, kept on its record (Onhand, Reserved, Sold...); this adapter reads it as the
 * old status text ("RESERVED - DAVID 11/2") so the rules that compare it keep working, and writes it back as the state, who it is for and when.
 * Before migration 39 the old note is used as it was. A car with a record but no stock row gets one when its first status is written.
 */
export function createDbInventory(): InventoryAdapter {
  const db = () => docsDb(); // made when it is used: the build loads this file without the server's keys

  async function unitRows(ids: string[]) {
    for (const extra of [", stock_state, state_for, state_on", ""]) {
      const cols: string = "id, make, model_variant, year_model, color" + extra;
      const r = await db().from("docs_units").select(cols).in("id", ids).limit(3000);
      if (!r.error) return (r.data ?? []) as unknown as { id: string; make?: string; model_variant?: string; year_model?: string; color?: string; stock_state?: StockState | null; state_for?: string | null; state_on?: string | null }[];
    }
    return [];
  }

  async function joined(plates?: string[]): Promise<Joined[]> {
    let q = db().from("car_stock").select("unit_id, plate_no, remarks, list_model, list_color").eq("in_stock", true).limit(3000);
    if (plates) q = q.in("plate_no", plates);
    const { data: stock, error } = await q;
    if (error) throw new InventoryError(`The stock list could not be read: ${error.message}`);
    const ids = (stock ?? []).map((s) => s.unit_id as string);
    const u = new Map((ids.length ? await unitRows(ids) : []).map((x) => [x.id, x]));
    return (stock ?? []).map((s) => {
      const c = u.get(s.unit_id as string);
      const old = String(s.remarks ?? "");
      return {
        plate: s.plate_no as string, unitId: s.unit_id as string,
        remarks: c?.stock_state ? remarksText(c.stock_state, c.state_for, c.state_on, noteOf(old)) : old,
        makeType: [c?.make, (s.list_model as string | null) ?? c?.model_variant].filter(Boolean).join(" "), year: String(c?.year_model ?? ""), color: String((s.list_color as string | null) ?? c?.color ?? ""),
      };
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
      // a car of the record that is not in the stock: enough to name it (a folder, a receipt)
      const { data: c } = await db().from("docs_units").select("make, model_variant, year_model, color").eq("plate_no", key).is("archived_at", null).order("arrival_date", { ascending: false }).limit(1);
      const u = c?.[0];
      if (!u) return null;
      const makeType = [u.make, u.model_variant].filter(Boolean).join(" ");
      return { plate: key, status: "Available", ...(makeType ? { makeType } : {}), ...(u.year_model ? { year: String(u.year_model) } : {}), ...(u.color ? { color: String(u.color) } : {}) };
    },

    async setStatus(plate, status, ref) {
      const key = normalizePlate(plate);
      let [row] = await joined([key]);
      if (!row) {
        const { data: c } = await db().from("docs_units").select("id").eq("plate_no", key).is("archived_at", null).order("arrival_date", { ascending: false }).limit(1);
        if (!c?.[0]) throw new InventoryError(`Plate ${key} is not in the app's car list.`);
        const { data: last } = await db().from("car_stock").select("sort_order").order("sort_order", { ascending: false }).limit(1);
        const ins = await db().from("car_stock").upsert({ unit_id: c[0].id, plate_no: key, in_stock: true, source: "app", sort_order: Number(last?.[0]?.sort_order ?? 0) + 1 }, { onConflict: "unit_id" });
        if (ins.error) throw new InventoryError(`Could not put ${key} on the stock list: ${ins.error.message}`);
        row = { plate: key, unitId: c[0].id as string, remarks: "", makeType: "", year: "", color: "" };
      }
      const next = applyStatus(row.remarks, status, ref);
      if (next === row.remarks) return; // already says the right thing
      const parsed = stateFromStockNote(next, null, manilaToday());
      const probe = await db().from("docs_units").select("stock_state").eq("id", row.unitId).maybeSingle();
      if (probe.error) { // before migration 39: the note carries the status, as it used to
        const { error } = await db().from("car_stock").update({ remarks: next }).eq("unit_id", row.unitId);
        if (error) throw new InventoryError(`Could not save the status of ${key}: ${error.message}`);
        return;
      }
      const current = (probe.data?.stock_state as StockState | null) ?? null;
      let state: StockState | null = parsed.state === "Reserved" || parsed.state === "Sold" ? parsed.state : null;
      if (!state) { // "Available" again: only a reservation or a sale is lifted; a car for repair or not for sale stays so
        if (current === "Reserved" || current === "Sold") state = "Onhand"; else return;
      }
      const reservedOrSold = state === "Reserved" || state === "Sold";
      const { error } = await db().from("docs_units").update({ stock_state: state, state_for: reservedOrSold ? parsed.who : null, state_on: reservedOrSold ? (parsed.on ?? dateOfMonthDay(ref.date, manilaToday())) : null, last_change_source: "app" }).eq("id", row.unitId);
      if (error) throw new InventoryError(`Could not save the status of ${key}: ${error.message}`);
      await db().from("car_stock").update({ remarks: parsed.note || null }).eq("unit_id", row.unitId);
    },
  };
}
