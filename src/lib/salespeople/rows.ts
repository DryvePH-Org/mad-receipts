import { parsePercent, type HeardSalesperson } from "@/lib/extraction/voice-schema";

/** One line of the "Sold by" section on the review screen. Percent is text while being typed. */
export interface SalesRow {
  key: string;
  /** "" until a name from the list is chosen. */
  salespersonId: string;
  percent: string;
  /** The name as heard, shown when it still needs to be matched. */
  heard?: string;
}

export const MAX_SALESPEOPLE = 5;

// Rows built from saved data get stable keys (v0, d0...), because they are also rendered on the
// server and a counter would count differently there. The counter is only for rows added by hand.
let counter = 0;
export const newRowKey = () => `new-${++counter}`;

const percentText = (value: number | null) => (value === null ? "" : String(value));

/** Rows for the salespeople heard in a voice note, matched to the list where possible. */
export function rowsFromVoice(heard: HeardSalesperson[]): SalesRow[] {
  return heard.slice(0, MAX_SALESPEOPLE).map((h, i) => ({
    key: `v${i}`,
    salespersonId: h.salespersonId ?? "",
    percent: percentText(h.commission_percent),
    // Show what was heard when it wasn't an exact match, so staff can check it.
    heard: h.confidence === "exact" ? undefined : h.spoken,
  }));
}

/** Rows for a deal's saved salespeople. */
export function rowsFromDeal(people: { salespersonId: string; percent: number }[]): SalesRow[] {
  return people.map((p, i) => ({ key: `d${i}`, salespersonId: p.salespersonId, percent: percentText(p.percent) }));
}

const isBlank = (row: SalesRow) => !row.salespersonId && !row.percent.trim() && !row.heard;

/** The rows that count: completely blank ones are ignored. */
export const filledRows = (rows: SalesRow[]) => rows.filter((row) => !isBlank(row));

/**
 * Problems with the rows, in plain language. `completing` is true when this payment finishes the
 * sale: then at least one salesperson with a percent is required.
 */
export function validateRows(
  rows: SalesRow[],
  options: { active: { id: string; name: string }[]; names: Map<string, string> },
  completing: boolean,
): string[] {
  const filled = filledRows(rows);
  const errors: string[] = [];
  const activeIds = new Set(options.active.map((p) => p.id));
  const nameOf = (id: string) => options.names.get(id) ?? "This person";

  if (filled.length > MAX_SALESPEOPLE) errors.push(`At most ${MAX_SALESPEOPLE} salespeople.`);

  for (const row of filled) {
    if (!row.salespersonId) {
      errors.push(row.heard ? `Choose who "${row.heard}" is.` : "Choose a salesperson.");
      continue;
    }
    if (!activeIds.has(row.salespersonId)) {
      errors.push(`${nameOf(row.salespersonId)} isn't on the active list. Choose someone else, or ask an admin to reactivate them.`);
    }
    if (parsePercent(row.percent) === null) {
      errors.push(`Enter ${nameOf(row.salespersonId)}'s commission % (0 to 100).`);
    }
  }

  const ids = filled.map((r) => r.salespersonId).filter(Boolean);
  if (new Set(ids).size !== ids.length) errors.push("Each salesperson can only be listed once.");

  if (completing && filled.length === 0) {
    errors.push("Add who sold the car and their commission % to complete the sale.");
  }
  return errors;
}

/** What the confirm request carries. Only call this once validateRows has no errors. */
export function toPayload(rows: SalesRow[]): { salespersonId: string; commissionPercent: number }[] {
  return filledRows(rows).map((row) => ({
    salespersonId: row.salespersonId,
    commissionPercent: parsePercent(row.percent) ?? 0,
  }));
}
