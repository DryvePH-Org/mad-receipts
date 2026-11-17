// Turns what people typed in the Docs Bible into clean values for the database. Pure functions, no network, no "@/" imports
// (the import script runs this file directly). The original text is always kept next to the clean value by the caller:
// a value that cannot be understood is NEVER guessed, it becomes null and an issue for the staff to look at.

export const PAPER_VALUES = ["Yes", "No", "To follow", "N/A"] as const;
export type Paper = (typeof PAPER_VALUES)[number];
export const CLASSIFICATIONS = ["Clean", "Repo (bank)", "Encumbered (Indiv)"] as const;
export const LEGACY_CLASS = "Not classified (legacy)";

export interface Normalized<T> { value: T | null; issue?: string }

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Plain text: trimmed, inner spaces collapsed; empty and error values (#REF!) become null. */
export function text(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = squash(String(raw));
  return s === "" || /^#(REF|N\/A|VALUE|NAME|DIV\/0|ERROR)/i.test(s) ? null : s;
}

/** "ngr 7902", "NGR-7902" → "NGR7902". */
export const plateKey = (raw: unknown): string => String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** The way a plate is shown: as the sheet had it, trimmed. */
export const plateShown = (raw: unknown): string => squash(String(raw ?? "")).toUpperCase();

/** A plate in the usual shape; others (old plates, conduction numbers) are allowed but flagged for a look. */
export const plateLooksUsual = (key: string): boolean => /^[A-Z]{2,3}\d{3,4}$/.test(key);

/** Yes / No / To follow / N/A, whatever the case or spacing. */
export function paper(raw: unknown): Normalized<Paper> {
  const s = text(raw);
  if (s === null) return { value: null };
  const k = s.toLowerCase().replace(/[\s.\-_/]/g, "");
  if (k === "yes" || k === "y") return { value: "Yes" };
  if (k === "no" || k === "n") return { value: "No" };
  if (k === "tofollow" || k === "follow") return { value: "To follow" };
  if (k === "na" || k === "notapplicable") return { value: "N/A" };
  return { value: null, issue: `"${s}" is not Yes, No, To follow or N/A` };
}

/** The three classifications; blank is "not classified (legacy)" (the owner's decision), anything else is an issue. */
export function classification(raw: unknown): Normalized<string> {
  const s = text(raw);
  if (s === null) return { value: LEGACY_CLASS };
  const hit = CLASSIFICATIONS.find((c) => c.toLowerCase() === s.toLowerCase());
  return hit ? { value: hit } : { value: LEGACY_CLASS, issue: `Classification "${s}" is not one of the three` };
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const iso = (y: number, m: number, d: number): string | null => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
};
const year4 = (y: number) => (y < 100 ? 2000 + y : y);

/**
 * A date as the sheet shows it: 2026-01-12, 1/12/2026, 01/12/26, "Jan 12, 2026", "12 Jan 2026". The sheet is used in the Philippines
 * with month first. Anything else is not guessed.
 */
export function dateOf(raw: unknown): Normalized<string> {
  const s = text(raw);
  if (s === null) return { value: null };
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) { const v = iso(+m[1], +m[2], +m[3]); return v ? { value: v } : { value: null, issue: `"${s}" is not a real date` }; }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) { const v = iso(year4(+m[3]), +m[1], +m[2]); return v ? { value: v } : { value: null, issue: `"${s}" is not a real month/day/year date` }; }
  m = /^([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{2,4})$/.exec(s);
  if (m && MONTHS[m[1].slice(0, 4).toLowerCase()] || m && MONTHS[m[1].slice(0, 3).toLowerCase()]) { const mo = MONTHS[m[1].slice(0, 4).toLowerCase()] ?? MONTHS[m[1].slice(0, 3).toLowerCase()]; const v = iso(year4(+m[3]), mo, +m[2]); if (v) return { value: v }; }
  m = /^(\d{1,2}) ([A-Za-z]{3,9})\.? (\d{2,4})$/.exec(s);
  if (m && (MONTHS[m[2].slice(0, 4).toLowerCase()] ?? MONTHS[m[2].slice(0, 3).toLowerCase()])) { const v = iso(year4(+m[3]), MONTHS[m[2].slice(0, 4).toLowerCase()] ?? MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]); if (v) return { value: v }; }
  return { value: null, issue: `Date "${s}" could not be understood` };
}

/** Spare key: the same thing was typed "W/SPAREKEY", "W/ SPARE KEY", "W/ SPAREKEY". One spelling each; anything else is kept as typed. */
export function spareKey(raw: unknown): string | null {
  const s = text(raw);
  if (s === null) return null;
  const k = s.toUpperCase().replace(/[\s]/g, "");
  if (k === "W/SPAREKEY") return "W/SPAREKEY";
  if (k === "W/OSPAREKEY") return "W/O SPAREKEY";
  if (k === "N/A") return "N/A";
  return s;
}

/** The sale status (column N) and the vehicle status (column W) normally say the same thing; when they do not, staff decide. */
const COMPATIBLE: Record<string, string[]> = {
  sold: ["SOLD"], onhand: ["AVAILABLE", "SHIPPED TO CEB"], reserved: ["AVAILABLE", "RESERVED"], "not for sale": ["NOT FOR SALE"],
};
export function statusesDisagree(sale: string | null, vehicle: string | null): boolean {
  if (!sale || !vehicle) return false; // one side blank is "incomplete", not a disagreement
  const ok = COMPATIBLE[sale.toLowerCase()];
  return ok ? !ok.includes(vehicle.toUpperCase()) : false;
}

export type HandoffEvent = { event: "submitted" | "received" | "note"; date: string | null; person: string | null; original: string };

/**
 * The free typing in REMARKS and UPDATES: "SUBMITTED TO JEP 9/15", "ORIG DOCS RECEIVED FROM JEP 10/21/2026", "JEP RECEIVED DOCS 09/18".
 * A year is added from the tab when the text has none. Text that is neither is kept whole as a note: never dropped.
 */
export function handoffEvent(raw: unknown, defaultYear: number): HandoffEvent | null {
  const s = text(raw);
  if (s === null) return null;
  const when = /(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/.exec(s);
  const date = when ? iso(when[3] ? year4(+when[3]) : defaultYear, +when[1], +when[2]) : null;
  const sub = /\bSUBMITTED\s+TO\s+([A-Z' .]+?)(?=\s+\d|\s*$)/i.exec(s);
  if (sub) return { event: "submitted", date, person: squash(sub[1]).toUpperCase() || null, original: s };
  const rec = /\b(?:ORIG(?:INAL)?\s+DOCS?\s+RECEIVED\s+(?:FROM|BY)\s+([A-Z' .]+?)(?=\s+\d|\s*$)|([A-Z' .]+?)\s+RECEIVED\s+DOCS)/i.exec(s);
  if (rec) return { event: "received", date, person: squash(rec[1] ?? rec[2] ?? "").toUpperCase() || null, original: s };
  return { event: "note", date: null, person: null, original: s };
}
