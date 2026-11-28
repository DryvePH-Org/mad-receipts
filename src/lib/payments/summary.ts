import { MODES, STAGE_LABEL, type BankLine, type SalePayment, type Stage } from "./parse";

// What the Payments tab shows, worked out from the bank lines and the sale payments kept in MAD. Pure.

export type Line = Pick<BankLine, "account" | "date" | "debit" | "credit" | "balance" | "type" | "mode" | "plate" | "row" | "tab">;
export type Pay = Pick<SalePayment, "stage" | "bank" | "amount" | "arNo" | "date" | "buyer" | "plate" | "tab" | "row">;

const round = (n: number) => Math.round(n * 100) / 100;
const monthOf = (date: string) => date.slice(0, 7);
const sumBy = <T,>(items: T[], f: (x: T) => number) => round(items.reduce((n, x) => n + f(x), 0));

export interface Totals { in: number; out: number; net: number; lines: number }
export interface Slice { key: string; in: number; out: number }

export interface PaymentsSummary {
  /** the months that have lines, oldest first, and the one shown */
  months: string[]; month: string | null;
  totals: Totals;
  /** every account: money in and out in the month, and the balance on its last line */
  accounts: { account: string; in: number; out: number; balance: number | null; lines: number }[];
  /** money in by account for every month (the stacked bars) */
  perMonth: { month: string; byAccount: Record<string, number>; total: number }[];
  byType: Slice[]; byMode: Slice[];
  /** the month day by day: money in, money out, and the running net */
  daily: { date: string; in: number; out: number; net: number }[];
  /** the month's sale payments by stage and bank */
  sales: { stage: Stage; label: string; byBank: Record<string, number>; total: number; count: number }[];
  salesBanks: string[];
  /** what needs a look */
  unlabelled: number; paymentsWithoutAr: number;
}

const ORDER: Stage[] = ["reservation", "additional", "full", "financing", "split"];

/** The slices of a list by one key, biggest money-in first (the biggest money-out first when nothing came in). */
function slices(lines: Line[], keyOf: (l: Line) => string): Slice[] {
  const m = new Map<string, Slice>();
  for (const l of lines) { const k = keyOf(l); const s = m.get(k) ?? { key: k, in: 0, out: 0 }; s.in = round(s.in + (l.credit ?? 0)); s.out = round(s.out + (l.debit ?? 0)); m.set(k, s); }
  return [...m.values()].sort((a, b) => b.in - a.in || b.out - a.out);
}

export function buildPayments(lines: Line[], pays: Pay[], month?: string | null): PaymentsSummary {
  const months = [...new Set(lines.map((l) => monthOf(l.date)))].sort();
  const shown = month && months.includes(month) ? month : months[months.length - 1] ?? null;
  const mine = lines.filter((l) => monthOf(l.date) === shown);
  const accounts = [...new Set(lines.map((l) => l.account))].sort();

  const perMonth = months.map((mo) => {
    const ofMonth = lines.filter((l) => monthOf(l.date) === mo);
    const byAccount = Object.fromEntries(accounts.map((a) => [a, sumBy(ofMonth.filter((l) => l.account === a), (l) => l.credit ?? 0)]));
    return { month: mo, byAccount, total: round(Object.values(byAccount).reduce((n, v) => n + v, 0)) };
  });

  const byDate = new Map<string, { in: number; out: number }>();
  for (const l of mine) { const d = byDate.get(l.date) ?? { in: 0, out: 0 }; d.in = round(d.in + (l.credit ?? 0)); d.out = round(d.out + (l.debit ?? 0)); byDate.set(l.date, d); }
  let run = 0;
  const daily = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => { run = round(run + d.in - d.out); return { date, in: d.in, out: d.out, net: run }; });

  const inMonth = pays.filter((p) => p.date && monthOf(p.date) === shown);
  const banks = [...new Set(inMonth.map((p) => p.bank || "NO BANK"))].sort();
  const sales = ORDER.map((stage) => {
    const of = inMonth.filter((p) => p.stage === stage);
    return { stage, label: STAGE_LABEL[stage], byBank: Object.fromEntries(banks.map((b) => [b, sumBy(of.filter((p) => (p.bank || "NO BANK") === b), (p) => p.amount)])), total: sumBy(of, (p) => p.amount), count: of.length };
  }).filter((s) => s.count > 0);

  return {
    months, month: shown,
    totals: { in: sumBy(mine, (l) => l.credit ?? 0), out: sumBy(mine, (l) => l.debit ?? 0), net: round(sumBy(mine, (l) => l.credit ?? 0) - sumBy(mine, (l) => l.debit ?? 0)), lines: mine.length },
    accounts: accounts.map((account) => {
      const of = mine.filter((l) => l.account === account).sort((a, b) => a.date.localeCompare(b.date) || a.row - b.row);
      const last = [...of].reverse().find((l) => l.balance !== null);
      return { account, in: sumBy(of, (l) => l.credit ?? 0), out: sumBy(of, (l) => l.debit ?? 0), balance: last?.balance ?? null, lines: of.length };
    }),
    perMonth,
    byType: slices(mine, (l) => l.type || "UNLABELLED"),
    byMode: slices(mine, (l) => l.mode).sort((a, b) => MODES.indexOf(a.key as never) - MODES.indexOf(b.key as never)),
    daily, sales, salesBanks: banks,
    unlabelled: mine.filter((l) => !l.type || l.type === "UNLABELLED").length,
    paymentsWithoutAr: inMonth.filter((p) => (p.stage === "reservation" || p.stage === "additional" || p.stage === "full") && !p.arNo).length,
  };
}
