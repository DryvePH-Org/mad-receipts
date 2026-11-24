import { applyStatus } from "@/lib/inventory/remarks";

// ONE status per car. It lives on the car record as `stock_state` (+ who it is reserved or sold for, and the date); the two old Docs Bible columns
// (STATUS, VEHICLE STATUS) are worked out from it by the database, so they can never disagree again, and the price list's REMARKS text is only
// a note. Pure code.

export const STOCK_STATES = ["Onhand", "Reserved", "Sold", "Not for sale", "For repair", "Sell as is", "Shipped to Cebu"] as const;
export type StockState = (typeof STOCK_STATES)[number];

/** The old STATUS and VEHICLE STATUS columns, as the database writes them from the one state (the same table is in migration 39). */
export function legacyOf(s: StockState): { sale_status: string; vehicle_status: string } {
  switch (s) {
    case "Sold": return { sale_status: "Sold", vehicle_status: "SOLD" };
    case "Reserved": return { sale_status: "Reserved", vehicle_status: "AVAILABLE" };
    case "Not for sale": return { sale_status: "Not For Sale", vehicle_status: "NOT FOR SALE" };
    case "Shipped to Cebu": return { sale_status: "Onhand", vehicle_status: "SHIPPED TO CEB" };
    default: return { sale_status: "Onhand", vehicle_status: "AVAILABLE" }; // Onhand, For repair, Sell as is
  }
}

/** The state the two old Docs Bible columns say. Null when they say nothing usable. */
export function stateFromLegacy(sale: string | null | undefined, vehicle: string | null | undefined): StockState | null {
  const s = String(sale ?? "").trim().toLowerCase(), v = String(vehicle ?? "").trim().toUpperCase();
  if (s === "sold" || v === "SOLD") return "Sold";
  if (s === "reserved") return "Reserved";
  if (s === "not for sale" || v === "NOT FOR SALE") return "Not for sale";
  if (v === "SHIPPED TO CEB") return "Shipped to Cebu";
  if (s === "onhand" || v === "AVAILABLE") return "Onhand";
  return null;
}

/** "11/14" (as the staff write it) to a date: this year, or last year when that day is still far ahead. */
export function dateOfMonthDay(md: string, today: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(md.trim());
  if (!m) return null;
  const [mo, d] = [Number(m[1]), Number(m[2])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let year = Number(today.slice(0, 4));
  const candidate = (y: number) => `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  if (Date.parse(`${candidate(year)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`) > 45 * 86_400_000) year -= 1;
  const iso = candidate(year);
  return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) ? null : iso;
}

export const monthDay = (iso: string | null | undefined): string => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : "");

const STATUS_NOTE = /^\s*(RESERVED|SOLD) - (.+?) (\d{1,2}\/\d{1,2})(?=\s*(?:\||$))/i;

/** What the price list's status note and repair state say: the state, who it is for (as typed, with any commission percent), when, and the rest of the note. */
export function stateFromStockNote(remarks: string | null | undefined, repair: string | null | undefined, today: string): { state: StockState | null; who: string | null; on: string | null; note: string } {
  const text = String(remarks ?? "").trim();
  const note = applyStatus(text, "Available", { receiptNo: "", people: [], date: "" });
  const m = STATUS_NOTE.exec(text);
  if (m) return { state: m[1].toUpperCase() === "SOLD" ? "Sold" : "Reserved", who: m[2].trim().toUpperCase(), on: dateOfMonthDay(m[3], today), note };
  if (/^\s*SOLD\b/i.test(text)) return { state: "Sold", who: null, on: null, note };
  if (/^\s*RESERVED\b/i.test(text)) return { state: "Reserved", who: null, on: null, note };
  const r = String(repair ?? "").trim().toUpperCase();
  if (r === "FOR REPAIR" || /^\s*FOR REPAIR\b/i.test(text)) return { state: "For repair", who: null, on: null, note: text };
  if (r === "SELL AS IS") return { state: "Sell as is", who: null, on: null, note: text };
  return { state: null, who: null, on: null, note: text };
}

/** The status part of the old REMARKS text ("RESERVED - DAVID 11/2", "SOLD - DAVID 3% ELLA 1.5% 11/2"), made from the one state; empty for the other states. */
export function statusText(state: StockState | null | undefined, who: string | null | undefined, on: string | null | undefined): string {
  if (state !== "Reserved" && state !== "Sold") return "";
  return [state === "Sold" ? "SOLD" : "RESERVED", "-", String(who ?? "").trim(), monthDay(on)].filter(Boolean).join(" ").replace(/^(RESERVED|SOLD) -$/, "$1");
}

/** The REMARKS cell as the old sheet showed it: the status part, then the note. */
export function remarksText(state: StockState | null | undefined, forName: string | null | undefined, on: string | null | undefined, note: string | null | undefined): string {
  return [statusText(state, forName, on), String(note ?? "").trim()].filter(Boolean).join(" | ");
}

export interface DerivedState { state: StockState; who: string | null; on: string | null; note: string; conflict: string | null }

/**
 * The one state of a car that has the price list's note and the Docs Bible's two columns today. A car on the price list takes what the price list
 * says (it is typed every day) for Reserved, Sold, For repair and Sell as is; otherwise the Docs Bible's columns; otherwise Onhand. A disagreement
 * that matters is returned as `conflict`, for the Data check.
 */
export function deriveState(input: { inStock: boolean; remarks: string | null; repair: string | null; sale: string | null; vehicle: string | null; today: string }): DerivedState {
  const list = input.inStock ? stateFromStockNote(input.remarks, input.repair, input.today) : { state: null as StockState | null, who: null as string | null, on: null as string | null, note: String(input.remarks ?? "").trim() };
  const docs = stateFromLegacy(input.sale, input.vehicle);
  const base = { who: list.who, on: list.on, note: list.note };
  if (list.state) {
    const conflict = docs && docs !== list.state && !(list.state === "For repair" || list.state === "Sell as is")
      ? `The price list says ${list.state}${list.who ? ` (${list.who})` : ""}, the Docs Bible said ${docs}.` : null;
    return { state: list.state, ...base, conflict };
  }
  if (docs) {
    const conflict = input.inStock && (docs === "Sold" || docs === "Reserved") ? `The Docs Bible said ${docs} but the car is still on the price list with no status note.` : null;
    return { state: docs, who: null, on: null, note: list.note, conflict };
  }
  return { state: "Onhand", who: null, on: null, note: list.note, conflict: null };
}
