import { applyStatus, parseStatus } from "@/lib/inventory/remarks";
import { monthDay, remarksText, type StockState } from "./state";
import { fullYear } from "@/lib/inventory/year";
import { availabilityOf, daysBetween, type Availability, type CarRow } from "./model";

// A Car status row made from the database: the stock row (prices, location, notes, and what the price list itself showed) + the car's record.
// Pure code, so it can be tested; the reading is in read.ts.

export interface StockFacts {
  plate_no: string; body_group: string | null; list_price: number | string | null; target_price: number | string | null; reprice: number | string | null; retarget: number | string | null;
  or_expiry: string | null; papers_with: string | null; tools?: string | null; location: string | null; repair_status: string | null; remarks: string | null;
  list_model: string | null; list_color: string | null; list_mileage: string | null; list_fuel: string | null; list_arrived_on: string | null; list_encumbrance: string | null;
}
export interface CarFacts {
  plate_display: string | null; arrival_date: string | null; year_model: string | null; make: string | null; model_variant: string | null; color: string | null; mileage: string | null;
  trans: string | null; fuel: string | null; encumbrance: string | null; spare_key: string | null; body_type: string | null; or_expiry: string | null; papers_with?: string | null;
  /** the one status (migration 39); null before the backfill: the old note and repair state are used then */
  stock_state?: StockState | null; state_for?: string | null; state_on?: string | null;
}

const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? null : Math.round(Number(v)));
const text = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

/** What is left of the status cell when its status part (RESERVED - NAME 11/2) is taken out. */
export const noteOf = (remarks: string): string => applyStatus(remarks, "Available", { receiptNo: "", people: [], date: "" });

const availabilityOfState = (s: StockState): Availability => (s === "Reserved" ? "reserved" : s === "Sold" ? "sold" : s === "For repair" ? "repair" : s === "Sell as is" ? "asis" : s === "Not for sale" ? "notforsale" : "available");

export function carRowOf(s: StockFacts, u: CarFacts, today: string, aboutSpareKey?: "yes" | "no" | ""): CarRow {
  const state = u.stock_state ?? null;
  // with a state, the status part of the old note is ignored: the state is the one truth, the note is only a note
  const remarks = state ? text(remarksText(state, u.state_for, u.state_on, noteOf(text(s.remarks)))) : text(s.remarks);
  const repairStatus = state ? (state === "For repair" ? "FOR REPAIR" : state === "Sell as is" ? "SELL AS IS" : "") : text(s.repair_status).toUpperCase();
  const arrived = s.list_arrived_on ?? u.arrival_date;
  const original = num(s.list_price), reprice = num(s.reprice);
  const availability = state ? availabilityOfState(state) : availabilityOf(remarks, repairStatus);
  const st = parseStatus(remarks);
  const location = text(s.location), bodyType = text(s.body_group) || text(u.body_type);
  const encumbrance = text(s.list_encumbrance ?? (/^N\/?A$/i.test(text(u.encumbrance)) ? "" : u.encumbrance));
  const ym = text(u.year_model);
  // one spare key: the car's record; a stored checklist answer only fills in when the record has none
  const spareKey = text(u.spare_key) || (aboutSpareKey === "yes" ? "W/SPAREKEY" : aboutSpareKey === "no" ? "NO SPAREKEY" : "");
  return {
    plate: s.plate_no, plateDisplay: text(u.plate_display).toUpperCase() || s.plate_no,
    year: fullYear(ym) || ym, brand: text(u.make), make: text(s.list_model ?? u.model_variant), color: text(s.list_color ?? u.color), mileage: text(s.list_mileage ?? u.mileage),
    trans: text(u.trans), fuel: text(s.list_fuel ?? u.fuel), bodyType,
    price: reprice ?? original, originalPrice: original, repriced: reprice !== null && original !== null && reprice < original, target: num(s.retarget) ?? num(s.target_price),
    arrived, daysInStock: arrived ? Math.max(0, daysBetween(arrived, today)) : null,
    remarks, reservedFor: st?.names ?? [], reservedOn: st?.date ?? (state === "Reserved" || state === "Sold" ? monthDay(u.state_on) || null : null),
    encumbrance, location, repairStatus, spareKey, orExp: u.or_expiry ?? s.or_expiry, docsCode: text(u.papers_with ?? s.papers_with),
    availability, sellable: availability === "available" || availability === "asis",
    toCebu: /CEBU/i.test(bodyType) || /CEBU/i.test(location) || state === "Shipped to Cebu",
    raw: { listPrice: num(s.list_price), targetPrice: num(s.target_price), reprice, retarget: num(s.retarget), tools: text(s.tools), papersWith: text(u.papers_with ?? s.papers_with), note: noteOf(remarks), state },
  };
}
