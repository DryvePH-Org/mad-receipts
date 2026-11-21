// A transfer is the record of one sale and its transfer (migrations 41 and 45): the buyer, the price, who sold it, who does the transfer, where the
// original documents are, and the stage. Pure code so it can be tested; the reading and saving are in server.ts.
import { STAGE_LABEL, type TransferStage } from "@/lib/sold/parse";

export { STAGE_LABEL, type TransferStage };
export const STAGES: TransferStage[] = ["in_process", "transferred", "released", "delivered", "unknown"];
export type Route = "mad" | "client" | "unknown";
export const ROUTE_LABEL: Record<Route, string> = { mad: "MAD does the transfer", client: "The client does it", unknown: "Not known" };

export interface Transfer {
  id: string; unitId: string | null; plate: string; carText: string | null; particular: string | null; financing: string | null; buyer: string | null; address: string | null;
  contact: string | null; crDate: string | null; transactionDate: string | null; liaison: string | null; sales: string | null; balance: string | null; note: string | null; doneOn: string | null;
  soldOn: string | null; agreedPrice: number | null; route: Route; stage: TransferStage; liaisonStatus: string | null; originalsAt: string | null; nextStep: string | null;
  chassisNo: string | null; engineNo: string | null; isReference: boolean; flags: string[]; plateOriginal: string | null;
}

export interface TransferInput {
  particular: string; financing: string; buyer: string; address: string; contact: string; crDate: string; transactionDate: string; liaison: string; sales: string; balance: string; note: string; doneOn: string; soldOn: string; agreedPrice: string; route: Route; stage: TransferStage; originalsAt: string; nextStep: string;
}

const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
const day = (v: string | null | undefined) => (/^\d{4}-\d{2}-\d{2}$/.test(clean(v)) ? clean(v) : null);

/** A price typed with commas or a peso sign; empty or not a positive number is nothing. */
const price = (v: string | null | undefined): number | null => { const n = Number(clean(v).replace(/[₱,\s]/g, "")); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null; };

/** The values as they are saved: trimmed, blanks as null, dates only when they are clear dates. */
export function transferColumns(i: TransferInput) {
  const up = (v: string) => clean(v).toUpperCase() || null;
  return {
    particular: up(i.particular), financing: up(i.financing), buyer: up(i.buyer), address: up(i.address), contact: clean(i.contact) || null,
    cr_date: day(i.crDate), transaction_date: day(i.transactionDate), liaison: up(i.liaison), sales: up(i.sales), balance: clean(i.balance) || null,
    note: clean(i.note) || null, done_on: day(i.doneOn),
    sold_on: day(i.soldOn), agreed_price: price(i.agreedPrice), route: (["mad", "client", "unknown"] as const).includes(i.route) ? i.route : "unknown",
    stage: STAGES.includes(i.stage) ? i.stage : "unknown", originals_at: clean(i.originalsAt) || null, next_step: clean(i.nextStep) || null,
  };
}

/** Whole days since the date (the sheet's AGEING column is never stored: it is worked out when shown). */
export function ageingDays(from: string | null, today: string): number | null {
  if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(from)) / 86_400_000));
}

/** Where a transfer stands: finished, or still in process (with how long since its CR date). */
export function transferState(t: Pick<Transfer, "doneOn" | "crDate"> & { stage?: TransferStage }, today: string): { done: boolean; days: number | null } {
  const done = !!t.doneOn || t.stage === "delivered";
  return { done, days: done ? null : ageingDays(t.crDate, today) };
}

/** Work that is still open: not delivered, not finished, and not an old row kept for reference. */
export const isOpen = (t: Pick<Transfer, "doneOn" | "stage" | "isReference">): boolean => !t.isReference && !t.doneOn && t.stage !== "delivered";
