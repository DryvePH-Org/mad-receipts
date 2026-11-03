import { UNIT_STATUS, type StatusRef, type UnitStatus } from "./types";

// How a unit's status is written in the inventory sheet's REMARKS cell, following what staff
// already type there ("RESERVED - DAVID 11/2"):
//   Reserved:  RESERVED - DAVID ELLA 11/2
//   Sold:      SOLD - DAVID 3% ELLA 1.5% 11/2     (each person's own commission percent)
// Other notes in the cell ("BIG BIG DROP", "FOR REPAIR - ...") are never removed: the status goes
// in front and the note stays after a " | ".

const SEPARATOR = " | ";

// Our status text at the start of the cell: words and percents, then M/D, then the end of the
// cell or a " | ".
const TOKEN = String.raw`(?:\p{L}[\p{L}.'-]*|\d+(?:\.\d+)?%)`;
const STATUS_SEGMENT = new RegExp(
  String.raw`^\s*(?:RESERVED|SOLD) - ${TOKEN}(?: ${TOKEN})*? \d{1,2}\/\d{1,2}(?=\s*(?:\||$))\s*(?:\|\s*)?`,
  "iu",
);

/** Name as shown in the sheet: capitals, letters only (a "|" or digit would break the format). */
function sheetName(name: string): string {
  const cleaned = name.replace(/[^\p{L} .'-]/gu, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "STAFF").toUpperCase();
}

/** 3 → "3%", 1.5 → "1.5%". */
const percentText = (percent: number) => `${Number(percent.toFixed(2))}%`;

/** "RESERVED - DAVID ELLA 11/2" or "SOLD - DAVID 3% ELLA 1.5% 11/2". */
export function formatStatusText(
  status: typeof UNIT_STATUS.reserved | typeof UNIT_STATUS.sold,
  ref: StatusRef,
): string {
  const sold = status === UNIT_STATUS.sold;
  const people = ref.people.length > 0 ? ref.people : [{ name: "", percent: null }];
  const who = people
    .map((p) => (sold && p.percent !== null ? `${sheetName(p.name)} ${percentText(p.percent)}` : sheetName(p.name)))
    .join(" ");
  return `${sold ? "SOLD" : "RESERVED"} - ${who} ${ref.date}`;
}

/** Reads the status out of a remarks cell: Reserved or Sold if it starts with that word, else Available. */
export function readStatus(remarks: string): UnitStatus {
  if (/^\s*SOLD\b/i.test(remarks)) return UNIT_STATUS.sold;
  if (/^\s*RESERVED\b/i.test(remarks)) return UNIT_STATUS.reserved;
  return UNIT_STATUS.available;
}

/**
 * The remarks cell after setting a unit's status.
 *  - Reserved / Sold: replaces a status of this format, or puts the new status in front of any note.
 *  - Available: removes a status of this format and leaves every other note as it is.
 */
export function applyStatus(existing: string, status: UnitStatus, ref: StatusRef): string {
  const text = existing.trim();
  const match = STATUS_SEGMENT.exec(text);
  const rest = match ? text.slice(match[0].length).trim() : text;

  if (status === UNIT_STATUS.available) return rest;
  const line = formatStatusText(status, ref);
  return rest ? `${line}${SEPARATOR}${rest}` : line;
}

/** "2026-11-02T07:30:00Z" → "11/2" in Manila time, the way staff write dates in the sheet. */
export function sheetDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "numeric", day: "numeric" }).format(
    new Date(iso),
  );
}
