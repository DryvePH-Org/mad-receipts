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
 * A car with a record that is not on the sale list yet is put on it when its first status is written.
 */
export function createDbInventory(): InventoryAdapter {
  const db = () => docsDb(); // made when it is used: the build loads this file without the server's keys

  async function joined(plates?: string[]): Promise<Joined[]> {
    let q = db().from("docs_units").select("id, plate_no, stock_note, list_model, list_color, make, model_variant, year_model, color, stock_state, state_for, state_on").eq("in_stock", true).is("archived_at", null).limit(3000);
    if (plates) q = q.in("plate_no", plates);
    const { data, error } = await q;
    if (error) throw new InventoryError(`The stock list could not be read: ${error.message}`);
    return (data ?? []).map((c) => {
      const old = String(c.stock_note ?? "");
      return {
        plate: c.plate_no as string, unitId: c.id as string,
        remarks: c.stock_state ? remarksText(c.stock_state as StockState, c.state_for as string | null, c.state_on as string | null, noteOf(old)) : old,
        makeType: [c.make, (c.list_model as string | null) ?? c.model_variant].filter(Boolean).join(" "), year: String(c.year_model ?? ""), color: String((c.list_color as string | null) ?? c.color ?? ""),
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
        const { data: last } = await db().from("docs_units").select("stock_order").order("stock_order", { ascending: false }).limit(1);
        const ins = await db().from("docs_units").update({ in_stock: true, stock_order: Number(last?.[0]?.stock_order ?? 0) + 1, last_change_source: "app" }).eq("id", c[0].id as string);
        if (ins.error) throw new InventoryError(`Could not put ${key} on the stock list: ${ins.error.message}`);
        row = { plate: key, unitId: c[0].id as string, remarks: "", makeType: "", year: "", color: "" };
      }
      const next = applyStatus(row.remarks, status, ref);
      if (next === row.remarks) return; // already says the right thing
      const parsed = stateFromStockNote(next, null, manilaToday());
      const probe = await db().from("docs_units").select("stock_state").eq("id", row.unitId).maybeSingle();
      if (probe.error) throw new InventoryError(`Could not read the status of ${key}: ${probe.error.message}`);
      const current = (probe.data?.stock_state as StockState | null) ?? null;
      let state: StockState | null = parsed.state === "Reserved" || parsed.state === "Sold" ? parsed.state : null;
      if (!state) { // "Available" again: only a reservation or a sale is lifted; a car for repair or not for sale stays so
        if (current === "Reserved" || current === "Sold") state = "Onhand"; else return;
      }
      const reservedOrSold = state === "Reserved" || state === "Sold";
      const { error } = await db().from("docs_units").update({ stock_state: state, state_for: reservedOrSold ? parsed.who : null, state_on: reservedOrSold ? (parsed.on ?? dateOfMonthDay(ref.date, manilaToday())) : null, stock_note: parsed.note || null, last_change_source: "app" }).eq("id", row.unitId);
      if (error) throw new InventoryError(`Could not save the status of ${key}: ${error.message}`);
    },
  };
}
