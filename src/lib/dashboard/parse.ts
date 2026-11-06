// Reading what staff type into the Google Sheets. People write "₱458,000", "Php20,000", "400K", "230k all in",
// "290+20k", "October 14", "11/03/2026" and leave cells blank, so everything here is forgiving and never throws.

/** "₱458,000" → 458000, "400K" → 400000, "230k all in" → 230000, "Php20,000" → 20000, "1.2M" → 1200000. Unreadable → null. */
export function parseMoney(text: string | null | undefined): number | null {
  const t = (text ?? "").replace(/[₱,\s]/g, "").replace(/^php/i, "").toLowerCase();
  // "290+20k" is 290k + 20k: the k at the end belongs to every part
  const sum = /^(\d+(?:\.\d+)?)\+(\d+(?:\.\d+)?)(k|m)/.exec(t);
  if (sum) return Math.round((Number(sum[1]) + Number(sum[2])) * (sum[3] === "k" ? 1_000 : 1_000_000) * 100) / 100;
  const m = /^(-?\d+(?:\.\d+)?)(k|m)?/.exec(t);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === "k" ? 1_000 : m[2] === "m" ? 1_000_000 : 1);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const monthIndex = (word: string): number => MONTHS.findIndex((m) => m === word || (word.length >= 3 && m.startsWith(word.slice(0, 3)) && m.startsWith(word)));
const iso = (y: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null);

/**
 * A date as staff write it, as YYYY-MM-DD: "11/03/2026" (month first), "October 14" (the year is `year`), "Nov 2", "2026-11-03".
 * Anything else, including blank, is null.
 */
export function parseSheetDate(text: string | null | undefined, year: number): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(t);
  if (m) return iso(Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[1]), Number(m[2]));
  m = /^([A-Za-z]+)\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?/.exec(t);
  if (m) {
    const mi = monthIndex(m[1].toLowerCase());
    return mi >= 0 ? iso(m[3] ? Number(m[3]) : year, mi + 1, Number(m[2])) : null;
  }
  return null;
}

/**
 * A car's price as staff type it. Staff often leave the K off ("460", "320- Securitybank") or mistype it ("1,030M" for 1,030K),
 * and no car costs under ₱1,000 or over ₱20 million, so those are read as thousands.
 */
export function parsePrice(text: string | null | undefined): number | null {
  const n = parseMoney(text);
  if (n === null || n <= 0) return n;
  if (n < 1_000) return n * 1_000;
  if (n > 20_000_000) return n / 1_000 <= 20_000_000 ? n / 1_000 : null;
  return n;
}

/** Plate without spaces or dashes, in capitals. */
export const plateKey = (text: string | null | undefined) => (text ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Collapses spaces, trims. */
export const clean = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

/** Splits "DAVID, ARON" / "Karen/Camila" into names in capitals. */
export const people = (text: string | null | undefined): string[] =>
  clean(text).split(/[,/&]|\band\b/i).map((n) => n.trim().toUpperCase()).filter(Boolean);

/** The year in a tab name ("NOVEMBER 2026", "Nov2026_Sold"), or the fallback. */
export const yearOfTab = (name: string, fallback: number) => Number(/(20\d{2})/.exec(name)?.[1]) || fallback;

/** "NOVEMBER 2026" or "Nov2026_Sold" → "2026-11" (the month by its first three letters), or null. */
export function tabMonthKey(tab: string, fallbackYear: number): string | null {
  const i = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(tab.trim().slice(0, 3).toLowerCase());
  return i < 0 ? null : `${yearOfTab(tab, fallbackYear)}-${String(i + 1).padStart(2, "0")}`;
}

/** Index of the first header cell that matches one of the names (case and spacing ignored), or -1. */
export function findColumn(header: string[], ...names: (string | RegExp)[]): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return header.findIndex((cell) => names.some((n) => (typeof n === "string" ? norm(cell) === norm(n) : n.test(cell.trim()))));
}

/** Rows of a CSV text (quotes, commas and line breaks inside quotes handled). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** What a dashboard says about how complete and fresh its numbers are. */
export interface DataNotes {
  /** tabs that exist but could not be read: their numbers are missing from the page */
  failed: string[];
  /** set when some of the data is an older copy, because Google could not be reached: when that copy was read (ISO) */
  staleSince: string | null;
}
