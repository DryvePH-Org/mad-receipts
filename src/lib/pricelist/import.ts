import { parseMoney, parseSheetDate } from "@/lib/cars/model";

// Taking the INVENTORY 2026 tab of the MAD Price List over: one snapshot row in, one clean car out, plus what a person must look at.
// Pure code; the reading of the workbook is scripts/pricelist-snapshot.py and the saving is scripts/pricelist-apply.ts.

export type SnapshotRow = Record<string, string | number | null | undefined> & { _row: number; _group?: string | null; _order?: number };

export type PriceIssueKind = "pricelist_docs_code" | "pricelist_unmatched" | "pricelist_odd_value" | "pricelist_differs";
export interface PriceIssue { kind: PriceIssueKind; plate: string | null; sourceRow: number; message: string }

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
  if (n === null) issues.push({ kind: "pricelist_odd_value", plate, sourceRow: r._row, message: `${col} says "${raw}", which is not an amount. It was left empty.` });
  return n;
}

export function normalizeCar(r: SnapshotRow): { stock: StockInput | null; skipped?: string; issues: PriceIssue[] } {
  const issues: PriceIssue[] = [];
  const plate = norm(r["PLATE NUMBER"]);
  if (!plate) return { stock: null, skipped: "no plate", issues };
  if (isTestRow(r)) return { stock: null, skipped: "test row", issues };
  if (!usualPlate(plate)) issues.push({ kind: "pricelist_odd_value", plate, sourceRow: r._row, message: `The plate "${r["PLATE NUMBER"]}" does not look like a usual plate (three letters and three or four digits).` });

  const orRaw = text(r["OR EXP"]);
  const orExpiry = orRaw ? parseSheetDate(orRaw) : null;
  if (orRaw && !orExpiry) issues.push({ kind: "pricelist_odd_value", plate, sourceRow: r._row, message: `OR EXP was typed as "${orRaw}", which is not a clear date. It is kept as typed.` });

  const docs = text(r["DOCS"]);
  if (docs) issues.push({ kind: "pricelist_docs_code", plate, sourceRow: r._row, message: `The DOCS column of the price list says "${docs}". It is kept as typed (shown as "Papers with"); the staff should say what it means.` });

  const stock: StockInput = {
    plate, plateDisplay: text(r["PLATE NUMBER"]) ?? plate, group: (r._group as string | null | undefined) ?? null, order: Number(r._order ?? 0), sourceRow: r._row,
    listPrice: money(r, "PRICE", plate, issues), targetPrice: money(r, "TARGET", plate, issues), reprice: money(r, "REPRICE", plate, issues), retarget: money(r, "RE-TARGET", plate, issues),
    orExpiry, orExpiryRaw: orExpiry ? null : orRaw, papersWith: docs, tools: text(r["TOOLS"]), location: text(r["LOCATION"]), repairStatus: text(r["REPAIR STATUS"]), remarks: text(r["REMARKS"]),
    identity: { spareKey: text(r["SPAREKEY"]), ym: text(r["YM"]), brand: text(r["BRAND"]), make: text(r["MAKE"]), color: text(r["COLOR"]), mileage: text(r["MILEAGE"]), trans: text(r["TRANS"]), fuel: text(r["FUEL"]), arrived: (() => { const a = text(r["DATE ARRIVED"]); return a ? parseSheetDate(a) : null; })(), encumbrance: text(r["ENCUMBRANCE"]) },
  };
  return { stock, issues };
}

export interface UnitIdentity { year_model: string | null; make: string | null; model_variant: string | null; color: string | null; trans: string | null; fuel: string | null; spare_key: string | null }

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
/** "BLACK" and "GALAXY BLACK" are the same colour said at two levels of detail: only a real disagreement counts. */
const sameColor = (a: string, b: string) => { const x = norm(a), y = norm(b); return x === y || x.includes(y) || y.includes(x); };

/** What the price list and the Docs Bible say differently about the same car: pointed out, never changed. */
export function identityDifferences(s: StockInput, u: UnitIdentity): string[] {
  const out: string[] = [];
  if (s.identity.ym && u.year_model && yy(s.identity.ym) !== yy(u.year_model)) out.push(`Year: the price list says ${s.identity.ym}, the Docs Bible says ${u.year_model}.`);
  if (s.identity.brand && u.make && norm(s.identity.brand) !== norm(u.make)) out.push(`Brand: the price list says ${s.identity.brand}, the Docs Bible says ${u.make}.`);
  if (s.identity.color && u.color && !sameColor(s.identity.color, u.color)) out.push(`Color: the price list says ${s.identity.color}, the Docs Bible says ${u.color}.`);
  if (s.identity.trans && u.trans && norm(s.identity.trans) !== norm(u.trans)) out.push(`Transmission: the price list says ${s.identity.trans}, the Docs Bible says ${u.trans}.`);
  if (s.identity.fuel && u.fuel && !sameFuel(s.identity.fuel, u.fuel)) out.push(`Fuel: the price list says ${s.identity.fuel}, the Docs Bible says ${u.fuel}.`);
  const a = spareKeyState(s.identity.spareKey), b = spareKeyState(u.spare_key);
  if (a !== "unknown" && b !== "unknown" && a !== b) out.push(`Spare key: the price list says "${s.identity.spareKey}", the Docs Bible says "${u.spare_key}".`);
  return out;
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
