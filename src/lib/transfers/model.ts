// Transfers of the OR/CR to the buyer (migration 41). Pure code so it can be tested; the reading and saving are in server.ts.

export interface Transfer {
  id: string; unitId: string | null; plate: string; carText: string | null; particular: string | null; financing: string | null; buyer: string | null; address: string | null;
  contact: string | null; crDate: string | null; transactionDate: string | null; liaison: string | null; sales: string | null; balance: string | null; note: string | null; doneOn: string | null;
}

export interface TransferInput {
  particular: string; financing: string; buyer: string; address: string; contact: string; crDate: string; transactionDate: string; liaison: string; sales: string; balance: string; note: string; doneOn: string;
}

const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
const day = (v: string | null | undefined) => (/^\d{4}-\d{2}-\d{2}$/.test(clean(v)) ? clean(v) : null);

/** The values as they are saved: trimmed, blanks as null, dates only when they are clear dates. */
export function transferColumns(i: TransferInput) {
  const up = (v: string) => clean(v).toUpperCase() || null;
  return {
    particular: up(i.particular), financing: up(i.financing), buyer: up(i.buyer), address: up(i.address), contact: clean(i.contact) || null,
    cr_date: day(i.crDate), transaction_date: day(i.transactionDate), liaison: up(i.liaison), sales: up(i.sales), balance: clean(i.balance) || null,
    note: clean(i.note) || null, done_on: day(i.doneOn),
  };
}

/** Whole days since the date (the sheet's AGEING column is never stored: it is worked out when shown). */
export function ageingDays(from: string | null, today: string): number | null {
  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(from)) / 86_400_000));
}

/** Where a transfer stands: finished, or still in process (with how long since its CR date). */
export function transferState(t: Pick<Transfer, "doneOn" | "crDate">, today: string): { done: boolean; days: number | null } {
  return { done: !!t.doneOn, days: t.doneOn ? null : ageingDays(t.crDate, today) };
}
