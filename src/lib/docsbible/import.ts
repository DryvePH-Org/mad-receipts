// Plans the Docs Bible import from a frozen snapshot (see scripts/docs-bible-snapshot.py): the units, the staff's review items, the
// handoff events and a column-by-column balance. Pure: it reads the snapshot and returns plans; scripts/docs-bible-import.ts writes them.
import { classification, dateOf, handoffEvent, LEGACY_CLASS, paper, plateKey, plateLooksUsual, plateShown, spareKey, statusesDisagree, text, type HandoffEvent } from "./normalize";

export type Cell = [row: number, col: number, value: string, type: "s" | "n" | "d" | "b" | "e", formula: string | null];
export interface Snapshot { snapshot: string; sha256: string; takenAt: string; tabs: Record<string, { hidden: boolean; maxRow: number; maxCol: number; cells: Cell[] }> }

export const colLetter = (n: number): string => { let s = ""; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const headerKey = (s: string) => s.replace(/\s+/g, " ").trim().toUpperCase();

/** Docs Bible column header → database column. Located by header text, never by letter. */
const IDENTITY: Record<string, string> = {
  "CATEGORY": "category", "BODY TYPE": "body_type", "YM": "year_model", "MAKE": "make", "MODEL VARIANT": "model_variant", "COLOR": "color", "MILEAGE": "mileage",
  "TRANS": "trans", "FUEL": "fuel", "CS NO": "cs_no", "STATUS": "sale_status", "ENCUMBRANCE": "encumbrance", "MO FILE": "mo_file", "REG OWNER NAME": "reg_owner_name",
  "BUYING SOURCE": "buying_source", "AWARDED TO": "awarded_to", "SPARE KEY": "spare_key",
};
const PAPERS: Record<string, string> = {
  "CR": "cr", "OR": "or_receipt", "DEED OF SALE": "deed", "SELLER'S ID": "sellers_id", "SEC CERT": "sec_cert", "SEC ID'S": "sec_ids", "BOARDS RESO": "boards_reso",
  "ENCUMBERED": "encumbered", "CHATTEL": "chattel", "PROMISSORY": "promissory", "STENCIL": "stencil",
};
const FREE: Record<string, string> = { "VEHICLE STATUS": "vehicle_status", "BANK/ SOURCE": "bank_source", "RENEWAL": "renewal", "OTHER DOCS ATTACHED": "other_docs", "PAPER STATUS": "paper_status", "REMARKS I": "remarks_1", "REMARKS II": "remarks_2" };

export type IssueKind = "duplicate_plate" | "no_plate" | "status_disagree" | "legacy_classification" | "odd_date" | "odd_plate" | "unknown_value" | "other";
export interface Issue { kind: IssueKind; plate: string | null; sourceRow: number | null; message: string }
export interface UnitPlan { sourceRow: number; plate_no: string; plate_display: string; arrival_date: string | null; arrival_raw: string | null; fields: Record<string, string | null>; raw: Record<string, string> }
export interface EventPlan extends HandoffEvent { plate: string; tab: string; sourceRow: number }
export interface Balance { column: string; letter: string; target: string; sourceCells: number; inDatabase: number; setAside: number; ok: boolean }
export interface ImportPlan {
  units: UnitPlan[]; issues: Issue[]; events: EventPlan[]; unmatchedEvents: EventPlan[]; balance: Balance[]; notMigrated: { tab: string; what: string; count: number }[];
  counts: Record<string, number>;
}

const grid = (cells: Cell[]) => { const m = new Map<string, Cell>(); for (const c of cells) m.set(`${c[0]}:${c[1]}`, c); return (r: number, c: number) => m.get(`${r}:${c}`); };
const shown = (c: Cell | undefined): string => (c ? c[2] : "");
const isError = (c: Cell | undefined) => !!c && c[3] === "e";

export function planImport(snap: Snapshot, opts: { docsTab?: string } = {}): ImportPlan {
  const tabName = opts.docsTab ?? "DOCS 2026";
  const tab = snap.tabs[tabName];
  if (!tab) throw new Error(`The snapshot has no tab called ${tabName}`);
  const at = grid(tab.cells);

  // header row 1 → column numbers
  const headers = new Map<string, number>();
  for (let c = 1; c <= tab.maxCol; c++) { const h = headerKey(shown(at(1, c))); if (h && !headers.has(h)) headers.set(h, c); }
  const need = ["PLATE NO.", "DATE ARRIVAL", "CLASSIFICATION"];
  for (const n of need) if (!headers.has(n)) throw new Error(`The header "${n}" was not found in ${tabName} row 1: the sheet layout changed, stop and look.`);
  const plateCol = headers.get("PLATE NO.")!, arrivalCol = headers.get("DATE ARRIVAL")!, classCol = headers.get("CLASSIFICATION")!;

  const issues: Issue[] = [];
  const units: UnitPlan[] = [];
  const identityCols = [...headers].filter(([h]) => h in IDENTITY || h === "DATE ARRIVAL" || h === "PLATE NO.").map(([, c]) => c);

  let lastRow = 1;
  for (const c of tab.cells) if (c[0] > lastRow && c[1] >= 2 && c[1] <= 40) lastRow = c[0];
  for (let r = 2; r <= lastRow; r++) {
    const plateRaw = shown(at(r, plateCol));
    const key = plateKey(plateRaw);
    const hasData = identityCols.some((c) => text(shown(at(r, c))) !== null) || text(shown(at(r, classCol))) !== null;
    if (!key) { if (hasData) issues.push({ kind: "no_plate", plate: null, sourceRow: r, message: `Row ${r} has information but no plate number (${[...headers].filter(([h]) => h in IDENTITY).map(([, c]) => text(shown(at(r, c)))).filter(Boolean).slice(0, 4).join(", ")}). Add the plate or remove the row.` }); continue; }

    const raw: Record<string, string> = {};
    for (const [h, c] of headers) { const cell = at(r, c); if (cell && cell[2] !== "" && !isError(cell)) raw[`${colLetter(c)} ${h}`] = cell[2]; }

    const fields: Record<string, string | null> = {};
    for (const [h, db] of Object.entries(IDENTITY)) { const c = headers.get(h); if (c) fields[db] = db === "spare_key" ? spareKey(shown(at(r, c))) : text(shown(at(r, c))); }
    for (const [h, db] of Object.entries(FREE)) { const c = headers.get(h); if (c) fields[db] = isError(at(r, c)) ? null : (db === "remarks_1" || db === "remarks_2" ? (shown(at(r, c)).trim() || null) : text(shown(at(r, c)))); }
    for (const [h, db] of Object.entries(PAPERS)) {
      const c = headers.get(h); if (!c) continue;
      const p = paper(shown(at(r, c))); fields[db] = p.value;
      if (p.issue) issues.push({ kind: "unknown_value", plate: key, sourceRow: r, message: `${h}: ${p.issue}` });
    }
    const cl = classification(shown(at(r, classCol))); fields.classification = cl.value;
    if (cl.issue) issues.push({ kind: "unknown_value", plate: key, sourceRow: r, message: cl.issue });

    const arrivalRaw = text(shown(at(r, arrivalCol)));
    const arr = dateOf(shown(at(r, arrivalCol)));
    if (arr.issue) issues.push({ kind: "odd_date", plate: key, sourceRow: r, message: `DATE ARRIVAL: ${arr.issue}` });
    if (!plateLooksUsual(key)) issues.push({ kind: "odd_plate", plate: key, sourceRow: r, message: `Plate "${plateShown(plateRaw)}" is not in the usual letters-then-digits shape. Check it is right.` });
    if (statusesDisagree(fields.sale_status ?? null, fields.vehicle_status ?? null)) issues.push({ kind: "status_disagree", plate: key, sourceRow: r, message: `STATUS says ${fields.sale_status} but VEHICLE STATUS says ${fields.vehicle_status}. Decide which is right.` });
    if (cl.value === LEGACY_CLASS && (fields.vehicle_status === "AVAILABLE" || (fields.sale_status ?? "").toLowerCase() === "onhand")) issues.push({ kind: "legacy_classification", plate: key, sourceRow: r, message: "This car is still in stock but has no classification. Choose Clean, Repo (bank) or Encumbered (Indiv)." });

    units.push({ sourceRow: r, plate_no: key, plate_display: plateShown(plateRaw), arrival_date: arr.value, arrival_raw: arrivalRaw, fields, raw });
  }

  // two arrivals of one plate: both are kept; the staff are told and decide later
  const byPlate = new Map<string, UnitPlan[]>();
  for (const u of units) byPlate.set(u.plate_no, [...(byPlate.get(u.plate_no) ?? []), u]);
  for (const [plate, list] of byPlate) if (list.length > 1) issues.push({ kind: "duplicate_plate", plate, sourceRow: list[0].sourceRow, message: `${plate} is in the sheet ${list.length} times (rows ${list.map((u) => u.sourceRow).join(", ")}; arrivals ${list.map((u) => u.arrival_date ?? u.arrival_raw ?? "no date").join(" and ")}). Both are kept: decide whether it is a second arrival or a double entry.` });

  // the handoff text: REMARKS I and II of the register, and the follow-up columns of the monthly tabs
  const events: EventPlan[] = [], unmatchedEvents: EventPlan[] = [];
  const known = new Set(units.map((u) => u.plate_no));
  const seen = new Set<string>(); // the same step written in the register and again in a monthly tab is one event
  const push = (e: EventPlan) => { const k = `${e.plate}|${e.event}|${e.date ?? e.original}`; if (seen.has(k)) return; seen.add(k); (known.has(e.plate) ? events : unmatchedEvents).push(e); };
  for (const u of units) for (const f of ["remarks_1", "remarks_2"] as const) {
    for (const part of String(u.fields[f] ?? "").split("\n")) {
      if (/^\d{1,2} [A-Z][a-z]{2} \d{4}, /.test(part) || !/SUBMITTED|RECEIVED/i.test(part)) continue; // the bots' dated scan notes are not handoff events
      const e = handoffEvent(part, 2026); if (e && e.event !== "note") push({ ...e, plate: u.plate_no, tab: tabName, sourceRow: u.sourceRow });
    }
  }
  for (const name of ["AUG", "SEPT", "OCT", "NOV"]) {
    const t = snap.tabs[name]; if (!t) continue;
    const g = grid(t.cells);
    let hdrRow = 0, pCol = 0, soldTo = 0;
    for (let r = 1; r <= 3 && !pCol; r++) for (let c = 1; c <= t.maxCol; c++) { const h = headerKey(shown(g(r, c))); if (h.startsWith("PLATE")) { pCol = c; hdrRow = r; } if (h === "SOLD TO") soldTo = c; }
    if (!pCol) pCol = 10; // AUG and SEPT carry the plate in column J
    if (!soldTo) soldTo = 20;
    for (let r = hdrRow + 1; r <= t.maxRow; r++) {
      const plate = plateKey(shown(g(r, pCol))); if (!plate) continue;
      for (let c = soldTo + 3; c <= t.maxCol; c++) { // after SOLD TO, CONTACT, ADDRESS: the typed follow-up columns
        const cell = g(r, c); if (!cell || cell[3] === "e") continue;
        if (!/SUBMITTED|RECEIVED/i.test(cell[2])) continue;
        const e = handoffEvent(cell[2], 2026); if (e && e.event !== "note") push({ ...e, plate, tab: name, sourceRow: r });
      }
    }
  }

  // the balance: every non-empty cell of every migrated column is in the database or set aside on purpose
  const balance: Balance[] = [];
  const mapped: [string, string][] = [...Object.entries(IDENTITY), ...Object.entries(PAPERS), ...Object.entries(FREE), ["CLASSIFICATION", "classification"], ["DATE ARRIVAL", "arrival_date"], ["PLATE NO.", "plate_no"]];
  const rowsKept = new Set(units.map((u) => u.sourceRow));
  for (const [h, target] of mapped) {
    const c = headers.get(h); if (!c) continue;
    let source = 0, inDb = 0, aside = 0;
    for (let r = 2; r <= lastRow; r++) {
      const cell = at(r, c); if (!cell || cell[2].trim() === "") continue;
      source++;
      if (isError(cell)) { aside++; continue; }
      if (!rowsKept.has(r)) { aside++; continue; } // a row with no plate: in the review list instead
      const u = units.find((x) => x.sourceRow === r)!;
      const v = target === "arrival_date" ? (u.arrival_date ?? u.arrival_raw) : target === "plate_no" ? u.plate_no : u.fields[target];
      if (v !== null && v !== undefined && v !== "") inDb++; else aside++;
    }
    balance.push({ column: h, letter: colLetter(c), target, sourceCells: source, inDatabase: inDb, setAside: aside, ok: source === inDb + aside });
  }

  const notMigrated: ImportPlan["notMigrated"] = [];
  const errs = tab.cells.filter((c) => c[3] === "e").length;
  notMigrated.push({ tab: tabName, what: "cells showing an error (#REF! and the like): not data", count: errs });
  const aForm = tab.cells.filter((c) => c[1] === 1 && c[4]).length;
  notMigrated.push({ tab: tabName, what: "column A (a copy of the plate: a formula)", count: aForm });
  const aaForm = tab.cells.filter((c) => headers.get("COMPLETE DOCS?") === c[1] && c[4]).length;
  notMigrated.push({ tab: tabName, what: "COMPLETE DOCS? (a formula: computed again by the database)", count: aaForm });
  for (const name of Object.keys(snap.tabs)) if (name !== tabName) notMigrated.push({ tab: name, what: snap.tabs[name].hidden ? "hidden tab: kept in the raw archive only" : "kept in the raw archive; its follow-up text is read into handoff events", count: snap.tabs[name].cells.length });

  const counts = {
    unitRows: units.length, distinctPlates: byPlate.size, duplicatePlates: [...byPlate.values()].filter((l) => l.length > 1).length,
    noPlateRows: issues.filter((i) => i.kind === "no_plate").length, issues: issues.length, handoffEvents: events.length, handoffUnmatched: unmatchedEvents.length,
    legacyClassification: units.filter((u) => u.fields.classification === LEGACY_CLASS).length,
  };
  return { units, issues, events, unmatchedEvents, balance, notMigrated, counts };
}
