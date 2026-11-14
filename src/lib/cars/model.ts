import { parseStatus } from "@/lib/inventory/remarks";
import { fullYear } from "@/lib/inventory/year";
import { normalizePlate } from "@/lib/rules/plate";

// The Car status dashboard's data: one row per unit of the INVENTORY 2026 tab, tidied up, with what staff want to see at a glance
// (can it be sold? is it being repaired? how long has it been here?). Pure code: no sheet access here.

export type Availability = "available" | "asis" | "reserved" | "sold" | "repair";
export const AVAILABILITY_LABEL: Record<Availability, string> = { available: "Available", asis: "Sell as is", reserved: "Reserved", sold: "Sold", repair: "For repair" };

export interface CarRow {
  plate: string; plateDisplay: string;
  year: string; brand: string; make: string; color: string; mileage: string; trans: string; fuel: string; bodyType: string;
  /** the price to quote: the repriced one when there is one */
  price: number | null; originalPrice: number | null; repriced: boolean; target: number | null;
  arrived: string | null; daysInStock: number | null;
  remarks: string; reservedFor: string[]; reservedOn: string | null;
  encumbrance: string; location: string; repairStatus: string; spareKey: string; orExp: string | null; docsCode: string;
  availability: Availability; sellable: boolean; toCebu: boolean;
}

// ---------------- tidying the sheet's text ----------------

const clean = (v: string | undefined) => (v ?? "").replace(/\s+/g, " ").trim();

/** "₱588,000", "588000.0" → 588000. Null for blank or anything that is not a plain amount. */
export function parseMoney(v: string | undefined): number | null {
  const s = clean(v).replace(/[₱,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? Math.round(n) : null;
}

/** A date as the sheet shows it (2026-09-05, 9/5/2026, Sep 5, 2026) to YYYY-MM-DD. Null when it is not a clear date. */
export function parseSheetDate(v: string | undefined): string | null {
  const s = clean(v);
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return valid(+m[3], +m[1], +m[2]); // month first, as the sheet is set up
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(s); // the sheet often shows 9/5/26
  if (m) return valid(2000 + +m[3], +m[1], +m[2]);
  m = /^(\d{1,2})\/(\d{4})$/.exec(s); // "05/2027": a month, taken as its first day
  if (m) return valid(+m[2], +m[1], 1);
  const t = Date.parse(`${s} UTC`);
  return /[A-Za-z]{3}/.test(s) && Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}
function valid(y: number, mo: number, d: number): string | null {
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1 ? dt.toISOString().slice(0, 10) : null;
}

export const daysBetween = (fromIso: string, toIso: string): number => Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);

/** The spare key text staff type ("W/SPAREKEY", "W/ SPARE KEY", "NO SPAREKEY", "N/A") as yes, no or unknown. */
export function spareKeyState(v: string | undefined): "yes" | "no" | "unknown" {
  const s = clean(v).toUpperCase().replace(/[\s/.-]/g, "");
  if (!s) return "unknown";
  if (/^(WSPARE?KEY|WITHSPARE)/.test(s) || s.startsWith("WSPAREKEY")) return "yes";
  if (/^(NO|NP|N\/?A|NONE)/.test(s) || s === "NA") return "no";
  return "unknown";
}

// ---------------- availability ----------------

export function availabilityOf(remarks: string, repairStatus: string): Availability {
  const status = parseStatus(remarks)?.status;
  if (status === "Sold") return "sold";
  if (status === "Reserved") return "reserved";
  const repair = clean(repairStatus).toUpperCase();
  if (repair === "FOR REPAIR" || /^FOR REPAIR\b/i.test(clean(remarks))) return "repair";
  if (repair === "SELL AS IS") return "asis";
  return "available";
}

// ---------------- reading the tab ----------------

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const COLS: Record<string, string[]> = {
  docs: ["docs"], orExp: ["orexp"], spareKey: ["sparekey"], ym: ["ym"], brand: ["brand"], make: ["make"], color: ["color"], mileage: ["mileage"], trans: ["trans"], fuel: ["fuel"],
  plate: ["platenumber", "plateno", "plate"], price: ["price"], target: ["target"], arrived: ["datearrived"], reprice: ["reprice"], retarget: ["retarget"],
  remarks: ["remarks"], encumbrance: ["encumbrance"], location: ["location"], repair: ["repairstatus"],
};

/** Turns the displayed rows of the inventory tab into cars. Body-type headings ("SEDAN", "SUV/MPV"...) are rows with no plate; the cars below belong to them. */
export function parseInventoryRows(rows: string[][], today: string): CarRow[] {
  const headerAt = rows.slice(0, 10).findIndex((r) => r.some((c) => key(c) === "platenumber"));
  if (headerAt === -1) throw new Error('The "PLATE NUMBER" column was not found in the inventory tab.');
  const headers = rows[headerAt].map(key);
  const at = (name: string, from = 0) => { const list = COLS[name]; return headers.findIndex((h, i) => i >= from && list.includes(h)); };
  const idx = Object.fromEntries(Object.keys(COLS).map((k) => [k, at(k)])) as Record<string, number>;
  const daysCol = headers.findIndex((h) => h.startsWith("noofdays"));
  const get = (r: string[], k: string) => (idx[k] >= 0 ? clean(r[idx[k]]) : "");

  const out: CarRow[] = [];
  let bodyType = "";
  for (const r of rows.slice(headerAt + 1)) {
    const plate = normalizePlate(get(r, "plate"));
    if (!plate) {
      // a heading row: only one text cell, in the days column (where "SEDAN" is typed); a total or blank row is skipped
      const text = clean(r[daysCol >= 0 ? daysCol : 4]);
      if (text && /[A-Za-z]/.test(text) && r.filter((c) => clean(c) && !/^[\d.\s]+$/.test(clean(c))).length === 1) bodyType = text;
      continue;
    }
    const remarks = get(r, "remarks"), repairStatus = get(r, "repair").toUpperCase();
    const arrived = parseSheetDate(get(r, "arrived"));
    const original = parseMoney(get(r, "price")), reprice = parseMoney(get(r, "reprice"));
    const availability = availabilityOf(remarks, repairStatus);
    const st = parseStatus(remarks);
    const location = get(r, "location");
    out.push({
      plate, plateDisplay: get(r, "plate").toUpperCase(),
      year: fullYear(get(r, "ym")) || get(r, "ym"), brand: get(r, "brand"), make: get(r, "make"), color: get(r, "color"), mileage: get(r, "mileage"), trans: get(r, "trans"), fuel: get(r, "fuel"), bodyType,
      price: reprice ?? original, originalPrice: original, repriced: reprice !== null && original !== null && reprice < original, target: parseMoney(get(r, "retarget")) ?? parseMoney(get(r, "target")),
      arrived, daysInStock: arrived ? Math.max(0, daysBetween(arrived, today)) : null,
      remarks, reservedFor: st?.names ?? [], reservedOn: st?.date ?? null,
      encumbrance: get(r, "encumbrance"), location, repairStatus, spareKey: get(r, "spareKey"), orExp: parseSheetDate(get(r, "orExp")), docsCode: get(r, "docs"),
      availability, sellable: availability === "available" || availability === "asis",
      toCebu: /CEBU/i.test(bodyType) || /CEBU/i.test(location),
    });
  }
  return out;
}

// ---------------- who sees what ----------------

export type Role = "sales" | "admin" | "approver" | "documentation";
export type SensitiveField = "target" | "encumbrance" | "orExp" | "docsCode";

/** Everyone sees the car, its quoted price, whether it can be sold, its repair status and where it is. The rest depends on the role. */
export function hiddenFields(role: Role): ReadonlySet<SensitiveField> {
  if (role === "admin" || role === "approver") return new Set();
  if (role === "documentation") return new Set<SensitiveField>(["target"]);
  return new Set<SensitiveField>(["target", "encumbrance", "orExp", "docsCode"]); // sales
}

/** The car with the fields this role must not see removed, so they never reach the browser. */
export function forRole(car: CarRow, role: Role): CarRow {
  const hide = hiddenFields(role);
  return { ...car, target: hide.has("target") ? null : car.target, encumbrance: hide.has("encumbrance") ? "" : car.encumbrance, orExp: hide.has("orExp") ? null : car.orExp, docsCode: hide.has("docsCode") ? "" : car.docsCode };
}

// ---------------- filtering and sorting (done in the browser) ----------------

export interface CarFilter {
  q: string; availability: Availability[]; brands: string[]; bodyTypes: string[]; fuels: string[]; trans: string[];
  priceMin: number | null; priceMax: number | null; yearMin: number | null; yearMax: number | null; sellableOnly: boolean; repairOnly: boolean; spareKey: boolean;
}
export const EMPTY_FILTER: CarFilter = { q: "", availability: [], brands: [], bodyTypes: [], fuels: [], trans: [], priceMin: null, priceMax: null, yearMin: null, yearMax: null, sellableOnly: false, repairOnly: false, spareKey: false };

export function filterCars(cars: CarRow[], f: CarFilter): CarRow[] {
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  return cars.filter((c) => {
    if (words.length) {
      const hay = `${c.plate} ${c.plateDisplay} ${c.year} ${c.brand} ${c.make} ${c.color} ${c.bodyType} ${c.location} ${c.fuel} ${c.trans}`.toLowerCase();
      if (!words.every((w) => hay.includes(w.replace(/[^a-z0-9.]/g, "")) || hay.includes(w))) return false;
    }
    if (f.availability.length && !f.availability.includes(c.availability)) return false;
    if (f.brands.length && !f.brands.includes(c.brand)) return false;
    if (f.bodyTypes.length && !f.bodyTypes.includes(c.bodyType)) return false;
    if (f.fuels.length && !f.fuels.includes(c.fuel)) return false;
    if (f.trans.length && !f.trans.includes(c.trans)) return false;
    if (f.priceMin !== null && (c.price ?? 0) < f.priceMin) return false;
    if (f.priceMax !== null && (c.price === null || c.price > f.priceMax)) return false;
    const y = Number(c.year);
    if (f.yearMin !== null && !(y >= f.yearMin)) return false;
    if (f.yearMax !== null && !(y <= f.yearMax)) return false;
    if (f.sellableOnly && !c.sellable) return false;
    if (f.repairOnly && c.availability !== "repair") return false;
    if (f.spareKey && spareKeyState(c.spareKey) !== "yes") return false;
    return true;
  });
}

export type SortKey = "newest" | "oldest" | "priceLow" | "priceHigh" | "yearNew" | "brand" | "days";
export function sortCars(cars: CarRow[], by: SortKey): CarRow[] {
  const n = (v: number | null, empty: number) => v ?? empty;
  const cmp: Record<SortKey, (a: CarRow, b: CarRow) => number> = {
    newest: (a, b) => (b.arrived ?? "").localeCompare(a.arrived ?? ""),
    oldest: (a, b) => (a.arrived ?? "9999").localeCompare(b.arrived ?? "9999"),
    priceLow: (a, b) => n(a.price, Infinity) - n(b.price, Infinity),
    priceHigh: (a, b) => n(b.price, -1) - n(a.price, -1),
    yearNew: (a, b) => Number(b.year) - Number(a.year) || a.brand.localeCompare(b.brand),
    brand: (a, b) => a.brand.localeCompare(b.brand) || a.make.localeCompare(b.make),
    days: (a, b) => n(b.daysInStock, -1) - n(a.daysInStock, -1),
  };
  return [...cars].sort(cmp[by] ?? cmp.newest);
}

export interface CarSummary { total: number; sellable: number; available: number; asis: number; reserved: number; sold: number; repair: number; avgDays: number | null; oldest: number | null }
export function summarize(cars: CarRow[]): CarSummary {
  const count = (a: Availability) => cars.filter((c) => c.availability === a).length;
  const days = cars.filter((c) => c.sellable && c.daysInStock !== null).map((c) => c.daysInStock as number);
  return { total: cars.length, sellable: cars.filter((c) => c.sellable).length, available: count("available"), asis: count("asis"), reserved: count("reserved"), sold: count("sold"), repair: count("repair"), avgDays: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null, oldest: days.length ? Math.max(...days) : null };
}
