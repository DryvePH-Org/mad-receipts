import { UNIT_STATUS, type StatusRef, type UnitStatus } from "./types";

// How a unit's status is written in the inventory sheet's REMARKS cell, following what staff
// already type there: "RESERVED - DAVID 11/2". We add the percent paid: "RESERVED - DAVID 11/2 10%".
// Other notes in the cell ("BIG BIG DROP", "FOR REPAIR - ...") are never removed: the status goes
// in front and the note stays after a " | ".

const SEPARATOR = " | ";

// Our status text at the start of the cell, followed by the end of the cell or a " | ".
const STATUS_SEGMENT =
  /^\s*(?:RESERVED|SOLD) - \p{L}[\p{L} .'-]*? \d{1,2}\/\d{1,2}(?: \d{1,3}%)?(?=\s*(?:\||$))\s*(?:\|\s*)?/iu;

/** Name as shown in the sheet: capitals, letters only (a "|" or digit would break the format). */
function sheetName(name: string): string {
  const cleaned = name.replace(/[^\p{L} .'-]/gu, " ").replace(/\s+/g, " ").trim();
  return (cleaned || "STAFF").toUpperCase();
}

/** "RESERVED - DAVID 11/2 10%" or "SOLD - DAVID 11/2 100%". */
export function formatStatusText(status: typeof UNIT_STATUS.reserved | typeof UNIT_STATUS.sold, ref: StatusRef): string {
  const word = status === UNIT_STATUS.sold ? "SOLD" : "RESERVED";
  return `${word} - ${sheetName(ref.salesperson)} ${ref.date} ${ref.percentPaid}%`;
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

/**
 * Whole percent of the price paid. 100 only when fully paid, and at least 1 once anything is paid,
 * so "SOLD" always reads 100% and a reservation never rounds up to look complete.
 */
export function percentPaid(paidCentavos: number, priceCentavos: number): number {
  if (priceCentavos <= 0 || paidCentavos <= 0) return 0;
  if (paidCentavos >= priceCentavos) return 100;
  return Math.min(99, Math.max(1, Math.round((paidCentavos * 100) / priceCentavos)));
}

/** "2026-11-02T07:30:00Z" → "11/2" in Manila time, the way staff write dates in the sheet. */
export function sheetDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "numeric", day: "numeric" }).format(
    new Date(iso),
  );
}
