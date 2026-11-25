import { applyStatus, parseStatus } from "@/lib/inventory/remarks";
import { monthDay, remarksText, type StockState } from "./state";
import { fullYear } from "@/lib/inventory/year";
import { availabilityOf, daysBetween, type Availability, type CarRow } from "./model";

// A Car Inventory row made from the database: the stock row (prices, location, notes, and what the price list itself showed) + the car's record.
// Pure code, so it can be tested; the reading is in read.ts.

export interface StockFacts {
  plate_no: string; body_group: string | null; list_price: number | string | null; target_price: number | string | null; reprice: number | string | null; retarget: number | string | null;
  or_expiry: string | null; papers_with: string | null; tools?: string | null; location: string | null; repair_status: string | null; remarks: string | null;
}
export interface CarFacts {
  id?: string; buying_source?: string | null;
  plate_display: string | null; arrival_date: string | null; year_model: string | null; make: string | null; model_variant: string | null; color: string | null; mileage: string | null;
  trans: string | null; fuel: string | null; encumbrance: string | null; spare_key: string | null; body_type: string | null; or_expiry: string | null; papers_with?: string | null;
  /** on the sale list (false: left it, sold before) */
  in_stock?: boolean | null;
  /** the one status (migration 39); null before the backfill: the old note and repair state are used then */
  stock_state?: StockState | null; state_for?: string | null; state_on?: string | null;
}

const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? null : Math.round(Number(v)));
const text = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

/** What is left of the status cell when its status part (RESERVED - NAME 11/2) is taken out. */
export const noteOf = (remarks: string): string => applyStatus(remarks, "Available", { receiptNo: "", people: [], date: "" });

const availabilityOfState = (s: StockState): Availability => (s === "Reserved" ? "reserved" : s === "Sold" ? "sold" : s === "For repair" ? "repair" : s === "Sell as is" ? "asis" : s === "Not for sale" ? "notforsale" : "available");

export function carRowOf(s: StockFacts, u: CarFacts, today: string, extra: { agreedPrice?: number | null } = {}): CarRow {
  const state = u.stock_state ?? null;
  // with a state, the status part of the old note is ignored: the state is the one truth, the note is only a note
  const remarks = state ? text(remarksText(state, u.state_for, u.state_on, noteOf(text(s.remarks)))) : text(s.remarks);
  const repairStatus = state ? (state === "For repair" ? "FOR REPAIR" : state === "Sell as is" ? "SELL AS IS" : "") : text(s.repair_status).toUpperCase();
  const arrived = u.arrival_date;
  const original = num(s.list_price), reprice = num(s.reprice);
  const availability = state ? availabilityOfState(state) : availabilityOf(remarks, repairStatus);
  const st = parseStatus(remarks);
  const location = text(s.location), bodyType = text(s.body_group) || text(u.body_type);
  const encumbrance = text(/^N\/?A$/i.test(text(u.encumbrance)) ? "" : u.encumbrance);
  const ym = text(u.year_model);
  const spareKey = text(u.spare_key); // one spare key: the car's own record
  return {
    plate: s.plate_no, plateDisplay: text(u.plate_display).toUpperCase() || s.plate_no, unitId: u.id,
    record: { year_model: u.year_model, make: u.make, model_variant: u.model_variant, color: u.color, body_type: u.body_type, trans: u.trans, fuel: u.fuel, mileage: u.mileage, spare_key: u.spare_key, buying_source: u.buying_source ?? null },
    year: fullYear(ym) || ym, brand: text(u.make), make: text(u.model_variant), color: text(u.color), mileage: text(u.mileage),
    trans: text(u.trans), fuel: text(u.fuel), bodyType,
    price: reprice ?? original, originalPrice: original, repriced: reprice !== null && original !== null && reprice < original, target: num(s.retarget) ?? num(s.target_price),
    // a sold car stopped counting when it was sold; the others count up to today
    arrived, daysInStock: arrived ? Math.max(0, daysBetween(arrived, state === "Sold" && u.state_on ? u.state_on : today)) : null,
    remarks, reservedFor: st?.names ?? [], reservedOn: st?.date ?? (state === "Reserved" || state === "Sold" ? monthDay(u.state_on) || null : null),
    encumbrance, location, repairStatus, spareKey, orExp: u.or_expiry ?? s.or_expiry, docsCode: text(u.papers_with ?? s.papers_with),
    availability, sellable: (availability === "available" || availability === "asis") && u.in_stock !== false, listed: u.in_stock !== false,
    agreedPrice: availability === "reserved" || availability === "sold" ? extra.agreedPrice ?? null : null,
    toCebu: /CEBU/i.test(bodyType) || /CEBU/i.test(location) || state === "Shipped to Cebu",
    raw: { listPrice: num(s.list_price), targetPrice: num(s.target_price), reprice, retarget: num(s.retarget), tools: text(s.tools), papersWith: text(u.papers_with ?? s.papers_with), note: noteOf(remarks), state },
  };
}
