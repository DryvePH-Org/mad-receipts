import { parseMoney, parseSheetDate } from "@/lib/cars/model";

// Taking the INVENTORY 2026 tab of the MAD Price List over: one snapshot row in, one clean car out, plus what a person must look at.
// Pure code; the reading of the workbook is scripts/pricelist-snapshot.py and the saving is scripts/pricelist-apply.ts.

export type SnapshotRow = Record<string, string | number | null | undefined> & { _row: number; _group?: string | null; _order?: number };

export type SyncField = "arrival_date" | "model" | "color" | "mileage" | "fuel" | "encumbrance" | "year" | "brand" | "trans" | "spare_key" | "status" | "docs_code" | "unmatched" | "odd_value" | "or_expiry";
/** One place where the price list and the Docs Bible do not say the same thing (or something a person must know): a row of the price list check. */
export interface SyncItem { plate: string | null; field: SyncField; listValue: string | null; docsValue: string | null; sourceRow: number; message: string; /** for a car not in the Docs Bible: its price list row, so a person can add it or link it to the right plate later */ payload?: unknown }
export type PriceIssue = SyncItem;

export interface StockInput {
  plate: string; plateDisplay: string; group: string | null; order: number; sourceRow: number;
  listPrice: number | null; targetPrice: number | null; reprice: number | null; retarget: number | null;
  orExpiry: string | null; orExpiryRaw: string | null; papersWith: string | null; tools: string | null; location: string | null;
  repairStatus: string | null; remarks: string | null;
  /** the price list's own copy of what the Docs Bible also knows: used to fill a blank there and to point out differences */
  identity: { spareKey: string | null; ym: string | null; brand: string | null; make: string | null; color: string | null; mileage: string | null; trans: string | null; fuel: string | null; arrived: string | null; encumbrance: string | null };
}

const norm = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const text = (v: unknown): string | null => { const s = String(v ?? "").replace(/\s+/g, " ").trim(); return s ? s : null; };
export const plateKeyOf = (v: unknown) => norm(v);
const usualPlate = (p: string) => /^[A-Z]{3}\d{3,4}$/.test(p);

/** The rows of the sheet that are not cars: left out, and said so. */
export function isTestRow(r: SnapshotRow): boolean {
  const plate = norm(r["PLATE NUMBER"]);
  return plate === "TST001" || plate === "ABC1234" || /test row|delete/i.test(String(r["REMARKS"] ?? "")) || /^(test|delete)$/i.test(String(r["BRAND"] ?? "").trim());
}

function money(r: SnapshotRow, col: string, plate: string, issues: PriceIssue[]): number | null {
  const raw = r[col];
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") return raw > 0 ? Math.round(raw) : null;
  const n = parseMoney(String(raw));
  if (n === null) issues.push({ field: "odd_value", plate, listValue: String(raw), docsValue: null, sourceRow: r._row, message: `${col} says "${raw}", which is not an amount. It was left empty.` });
  return n;
}

export function normalizeCar(r: SnapshotRow): { stock: StockInput | null; skipped?: string; issues: PriceIssue[] } {
  const issues: PriceIssue[] = [];
  const plate = norm(r["PLATE NUMBER"]);
  if (!plate) return { stock: null, skipped: "no plate", issues };
  if (isTestRow(r)) return { stock: null, skipped: "test row", issues };
  if (!usualPlate(plate)) issues.push({ field: "odd_value", plate, listValue: String(r["PLATE NUMBER"]), docsValue: null, sourceRow: r._row, message: `The plate "${r["PLATE NUMBER"]}" does not look like a usual plate (three letters and three or four digits).` });

  const orRaw = text(r["OR EXP"]);
  const orExpiry = orRaw ? parseSheetDate(orRaw) : null;
  if (orRaw && !orExpiry) issues.push({ field: "odd_value", plate, listValue: orRaw, docsValue: null, sourceRow: r._row, message: `OR EXP was typed as "${orRaw}", which is not a clear date. It is kept as typed.` });

  const docs = text(r["DOCS"]);
  if (docs) issues.push({ field: "docs_code", plate, listValue: docs, docsValue: null, sourceRow: r._row, message: `The DOCS column of the price list says "${docs}". It is kept as typed (shown as "Papers with"); the staff should say what it means.` });

  const stock: StockInput = {
    plate, plateDisplay: text(r["PLATE NUMBER"]) ?? plate, group: (r._group as string | null | undefined) ?? null, order: Number(r._order ?? 0), sourceRow: r._row,
    listPrice: money(r, "PRICE", plate, issues), targetPrice: money(r, "TARGET", plate, issues), reprice: money(r, "REPRICE", plate, issues), retarget: money(r, "RE-TARGET", plate, issues),
    orExpiry, orExpiryRaw: orExpiry ? null : orRaw, papersWith: docs, tools: text(r["TOOLS"]), location: text(r["LOCATION"]), repairStatus: text(r["REPAIR STATUS"]), remarks: text(r["REMARKS"]),
    identity: { spareKey: text(r["SPAREKEY"]), ym: text(r["YM"]), brand: text(r["BRAND"]), make: text(r["MAKE"]), color: text(r["COLOR"]), mileage: text(r["MILEAGE"]), trans: text(r["TRANS"]), fuel: text(r["FUEL"]), arrived: (() => { const a = text(r["DATE ARRIVED"]); return a ? parseSheetDate(a) : null; })(), encumbrance: text(r["ENCUMBRANCE"]) },
  };
  return { stock, issues };
}

export interface UnitIdentity { year_model: string | null; make: string | null; model_variant: string | null; color: string | null; trans: string | null; fuel: string | null; spare_key: string | null; mileage?: string | null; encumbrance?: string | null; arrival_date?: string | null; sale_status?: string | null; vehicle_status?: string | null }

const yy = (v: unknown) => { const d = String(v ?? "").replace(/\D/g, ""); return d.length >= 2 ? d.slice(-2) : d; };

/** "W/SPAREKEY", "W/ SPAREKEY TBF" → yes; "N/A", "W/O SPAREKEY", "NO SPARE KEY" → no; anything else is unknown (not compared). */
export function spareKeyState(v: string | null | undefined): "yes" | "no" | "unknown" {
  const t = String(v ?? "").toUpperCase().replace(/[^A-Z/]/g, "");
  if (!t) return "unknown";
  if (/^(NO|NONE|N\/?A|W\/?O|WO|WITHOUT)/.test(t)) return "no";
  if (/^(W\/?SPARE|WITH|W\/?KEY|W\/?SPAREKEY|WSPARE)/.test(t)) return "yes";
  return "unknown";
}
const sameFuel = (a: string, b: string) => { const f = (x: string) => (/^(DSL|DIESEL)/.test(norm(x)) ? "DIESEL" : /^(GAS|GASOLINE|PETROL)/.test(norm(x)) ? "GAS" : norm(x)); return f(a) === f(b); };

export const FIELD_LABELS: Record<SyncField, string> = {
  arrival_date: "Arrival date", model: "Model", color: "Color", mileage: "Mileage", fuel: "Fuel", encumbrance: "Encumbrance", year: "Year", brand: "Brand", trans: "Transmission",
  spare_key: "Spare key", status: "Status", docs_code: "Papers-with code (DOCS)", unmatched: "Not in the Docs Bible", odd_value: "Odd value", or_expiry: "OR expiry",
};

const said = (label: string, listV: string, docsV: string) => `${label}: the price list says "${listV}", the Docs Bible says "${docsV}".`;

/** Every place the price list and the Docs Bible say something different about the same car (both sides filled in; a blank is not a difference). */
export function compareWithDocs(s: StockInput, u: UnitIdentity): SyncItem[] {
  const out: SyncItem[] = [];
  const add = (field: SyncField, listV: string | null | undefined, docsV: string | null | undefined, message?: string) => out.push({ plate: s.plate, field, listValue: listV ?? null, docsValue: docsV ?? null, sourceRow: s.sourceRow, message: message ?? said(FIELD_LABELS[field], String(listV), String(docsV)) });
  const both = (a: string | null | undefined, b: string | null | undefined): a is string => !!a && !!b && !/^N\/?A$/i.test(String(b).trim());
  const i = s.identity;
  if (both(i.ym, u.year_model) && yy(i.ym) !== yy(u.year_model)) add("year", i.ym, u.year_model);
  if (both(i.brand, u.make) && norm(i.brand) !== norm(u.make)) add("brand", i.brand, u.make);
  if (both(i.make, u.model_variant) && norm(i.make) !== norm(u.model_variant)) add("model", i.make, u.model_variant);
  if (both(i.color, u.color) && norm(i.color) !== norm(u.color)) add("color", i.color, u.color);
  if (both(i.mileage, u.mileage) && norm(i.mileage) !== norm(u.mileage)) add("mileage", i.mileage, u.mileage);
  if (both(i.trans, u.trans) && norm(i.trans) !== norm(u.trans)) add("trans", i.trans, u.trans);
  if (both(i.fuel, u.fuel) && !sameFuel(i.fuel, String(u.fuel))) add("fuel", i.fuel, u.fuel);
  if (both(i.encumbrance, u.encumbrance) && norm(i.encumbrance) !== norm(u.encumbrance)) add("encumbrance", i.encumbrance, u.encumbrance);
  if (both(i.arrived, u.arrival_date) && i.arrived !== u.arrival_date) add("arrival_date", i.arrived, u.arrival_date, `${said("Arrival date", i.arrived, String(u.arrival_date))} Days in stock follow the price list's date until this is settled.`);
  const a = spareKeyState(i.spareKey), b = spareKeyState(u.spare_key);
  if (a !== "unknown" && b !== "unknown" && a !== b) add("spare_key", i.spareKey, u.spare_key);
  // status: the price list's REMARKS note against the Docs Bible's sale and vehicle status
  const remarks = String(s.remarks ?? "");
  const listStatus = /^\s*SOLD\b/i.test(remarks) ? "Sold" : /^\s*RESERVED\b/i.test(remarks) ? "Reserved" : null;
  const docsSale = String(u.sale_status ?? "");
  const docsText = `${u.sale_status ?? "-"} / ${u.vehicle_status ?? "-"}`;
  if (listStatus && docsSale.toLowerCase() !== listStatus.toLowerCase()) add("status", remarks, docsText, `Status: the price list says "${remarks}", the Docs Bible says ${docsText}.`);
  else if (!listStatus && /^(sold|reserved)$/i.test(docsSale)) add("status", remarks || "(no status note)", docsText, `Status: the Docs Bible says ${docsText} but the car is still on the price list${remarks ? ` ("${remarks}")` : ""}.`);
  return out;
}

const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

/** The Docs Bible columns that are still blank for a car the price list knows more about: filled from the price list (never replaced). */
export function blankFills(s: StockInput, u: UnitIdentity): Record<string, string> {
  const out: Record<string, string> = {};
  const year = (() => { const d = String(s.identity.ym ?? "").replace(/\D/g, ""); return d.length === 2 ? d : d.length === 4 ? d.slice(2) : null; })();
  const pairs: [string, string | null, unknown][] = [
    ["trans", s.identity.trans, u.trans], ["fuel", s.identity.fuel, u.fuel], ["mileage", s.identity.mileage, u.mileage], ["color", s.identity.color, u.color],
    ["model_variant", s.identity.make, u.model_variant], ["make", s.identity.brand, u.make], ["year_model", year, u.year_model], ["spare_key", s.identity.spareKey, u.spare_key],
    ["encumbrance", s.identity.encumbrance, u.encumbrance], ["arrival_date", s.identity.arrived, u.arrival_date],
  ];
  for (const [column, listValue, docsValue] of pairs) if (!blank(listValue) && blank(docsValue)) out[column] = String(listValue);
  return out;
}

/** The stock row as saved (the same for the import and for a car added from the check list). */
export function stockRow(s: StockInput, unitId: string, o: Overrides, raw: unknown): Record<string, unknown> {
  return {
    unit_id: unitId, plate_no: s.plate, body_group: s.group, sort_order: s.order, list_price: s.listPrice, target_price: s.targetPrice, reprice: s.reprice, retarget: s.retarget,
    list_model: o.model, list_color: o.color, list_mileage: o.mileage, list_fuel: o.fuel, list_arrived_on: o.arrivedOn, list_encumbrance: o.encumbrance,
    or_expiry: s.orExpiry, or_expiry_raw: s.orExpiryRaw, papers_with: s.papersWith, tools: s.tools, location: s.location, repair_status: s.repairStatus, remarks: s.remarks,
    in_stock: true, source: "import", raw,
  };
}

/** A new Docs Bible row for a car that is on the price list only (what Add a car would make from the same words). Null when something needed is missing. */
export function newUnitFromList(s: StockInput, today: string): { fields: Record<string, string | null> } | { missing: string[] } {
  const year = (() => { const d = String(s.identity.ym ?? "").replace(/\D/g, ""); return d.length === 2 ? d : d.length === 4 ? d.slice(2) : null; })();
  const need: [string, unknown][] = [["brand", s.identity.brand], ["model", s.identity.make], ["year", year], ["color", s.identity.color]];
  const missing = need.filter(([, v]) => blank(v)).map(([k]) => k);
  if (missing.length) return { missing };
  const up = (v: string | null) => (v ? v.toUpperCase() : null);
  return { fields: { plate_no: s.plate, plate_display: s.plateDisplay.toUpperCase(), arrival_date: s.identity.arrived ?? today, make: up(s.identity.brand), model_variant: up(s.identity.make), year_model: year, color: up(s.identity.color), mileage: s.identity.mileage, trans: up(s.identity.trans), fuel: up(s.identity.fuel), spare_key: s.identity.spareKey, encumbrance: up(s.identity.encumbrance) } };
}

export interface Overrides { model: string | null; color: string | null; mileage: string | null; fuel: string | null; arrivedOn: string | null; encumbrance: string | null }

/**
 * What the price list said that the Docs Bible row does not say the same way. These are kept on the stock row so the Excel export (and Car status)
 * read exactly as the sheet did. A field the sheet left blank, or wrote the same way, is not kept: the Docs Bible value is shown.
 */
export function identityOverrides(s: StockInput, u: UnitIdentity): Overrides {
  const differs = (a: string | null, b: string | null | undefined) => !!a && norm(a) !== norm(b);
  return {
    model: differs(s.identity.make, u.model_variant) ? s.identity.make : null,
    color: differs(s.identity.color, u.color) ? s.identity.color : null,
    mileage: differs(s.identity.mileage, u.mileage) ? s.identity.mileage : null,
    fuel: differs(s.identity.fuel, u.fuel) ? s.identity.fuel : null,
    arrivedOn: s.identity.arrived && s.identity.arrived !== (u.arrival_date ?? null) ? s.identity.arrived : null,
    encumbrance: differs(s.identity.encumbrance, u.encumbrance) ? s.identity.encumbrance : null,
  };
}

// ---- the two small lists ----

export interface RepairInput { plate: string; ym: string | null; brand: string | null; problem: string | null; happenedOn: string | null; happenedRaw: string | null; solution: string | null; supplier: string | null; company: string | null; estTimeline: string | null; status: string | null; botId: string | null; approvedBy: string | null; order: number }

export function normalizeRepair(r: SnapshotRow, order: number): RepairInput | null {
  const plate = norm(r["PLATE NUMBER"]);
  if (!plate) return null;
  const when = text(r["WHEN THE PROBLEM HAPPENED"]);
  const date = when ? parseSheetDate(when) : null;
  return { plate, ym: text(r["YM"]), brand: text(r["BRAND"]), problem: text(r["PROBLEM"]), happenedOn: date, happenedRaw: date ? null : when, solution: text(r["SOLUTION"]), supplier: text(r["SUPPLIER / POINT PERSON"]), company: text(r["COMPANY"]), estTimeline: text(r["EST TIMELINE"]), status: text(r["STATUS"]), botId: text(r["BOT ID"]), approvedBy: text(r["APPROVED BY"]), order };
}

export interface RenewalInput { plate: string; monthLabel: string | null; orExpiry: string | null; orExpiryRaw: string | null; location: string | null; notes: string[]; order: number }

export function normalizeRenewal(r: SnapshotRow, order: number): RenewalInput | null {
  const plate = norm(r["PLATE NUMBER"]);
  if (!plate) return null;
  const raw = text(r["OR EXP"]);
  const date = raw ? parseSheetDate(raw) : null;
  const notes = ["REMARKS I", "REMARKS II", "REMAKRS III", "REMARKS III", "REMARKS IV", "REMARKS V", "REMAKRS VI", "REMARKS VI"].map((k) => text(r[k])).filter((v): v is string => !!v);
  return { plate, monthLabel: text(r["N"]), orExpiry: date, orExpiryRaw: date ? null : raw, location: text(r["LOCATION"]), notes, order };
}
