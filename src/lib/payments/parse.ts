import { parseMoney, parseSheetDate } from "@/lib/dashboard/parse";

// Reading the 2026 Sales Passbook Monitoring sheet: the deposit-slip tabs of each bank account (one per month) and the monthly sales tabs (the payments of each sale, with the bank,
// the date, the amount and the AR number). Staff type these by hand, so everything here is forgiving and never throws. Pure.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthNo = (word: string) => MONTHS.indexOf(word.trim().slice(0, 3).toLowerCase()) + 1;
const clean = (v: string | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
const num = (v: string | undefined) => { const n = parseMoney(clean(v)); return n === null || n === 0 ? null : n; };
const key = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;
export const plateOf = (v: string | undefined) => clean(v).toUpperCase().replace(/[^A-Z0-9]/g, "");

// ---------------- the bank tabs ----------------

export const MODES = ["Cash deposit", "Credit memo", "Debit memo", "Remittance", "Online transfer", "Fund transfer", "Check", "Other"] as const;
export type Mode = (typeof MODES)[number];

/** How the money moved, from the code staff write in the TC or CHECK NO. column ("CSHD", "DEPN", "CM", "DM", "REM", "ONLINE BT", a check number) and the particulars. */
export function modeOf(tc: string, ref: string, particulars: string): Mode {
  const code = clean(tc || ref).toUpperCase();
  if (/^(CSHD|DEPN|CASH)/.test(code) || /\bCASH DEP/.test(code)) return "Cash deposit";
  if (code === "CM") return "Credit memo";
  if (code === "DM") return "Debit memo";
  if (/^REM/.test(code)) return "Remittance";
  if (/ONLINE|IBFT|INSTAPAY|PESONET|GCASH|\bBT\b/.test(code)) return "Online transfer";
  if (/^0{3,}\d+$/.test(code) || /^(FT\b|FUND TRANSFER)/i.test(clean(particulars))) return "Fund transfer";
  if (/^\d{4,8}$/.test(code)) return "Check";
  return "Other";
}

export interface BankTabInfo { account: string; month: string | null }
/** "BDO DEPOSIT MONITORING - 3321 (NOV2026)" → BDO 3321, 2026-11; "SBTC ... - 5411 (SEPT2026)" and "SECURITY BANK ... - 5411" → Security Bank 5411. Null when it is not a bank tab. */
export function bankTabInfo(name: string): BankTabInfo | null {
  if (!/DEPOSIT\s+MONITORING/i.test(name)) return null;
  const acct = /(\d{4})\s*\(/.exec(name);
  const bank = /\bBDO\b/i.test(name) ? "BDO" : /SBTC|SECURITY\s*BANK/i.test(name) ? "Security Bank" : null;
  if (!acct || !bank) return null;
  const m = /\(([A-Za-z]{3,5})\s*(\d{4})\)/.exec(name);
  return { account: `${bank} ${acct[1]}`, month: m && monthNo(m[1]) ? key(Number(m[2]), monthNo(m[1])) : null };
}

export interface BankLine {
  account: string; tab: string; row: number; date: string; tc: string; ref: string; particulars: string; plate: string;
  debit: number | null; credit: number | null; balance: number | null; remarks: string; type: string; mode: Mode; note: string;
}

/** The lines of one deposit tab. A line is a row with a date; the rows before the first date (the title, the opening balance) and after the last are not lines. */
export function parseBankTab(rows: string[][], tab: string): BankLine[] {
  const info = bankTabInfo(tab);
  if (!info) return [];
  const year = Number(info.month?.slice(0, 4)) || new Date().getFullYear();
  const out: BankLine[] = [];
  rows.forEach((r, i) => {
    const date = parseSheetDate(clean(r[0]), year);
    if (!date) return;
    const debit = num(r[5]), credit = num(r[6]);
    if (debit === null && credit === null) return; // a date with no money (a closing balance line)
    const tc = clean(r[1]), ref = clean(r[2]), particulars = clean(r[3]);
    const type = clean(r[9]).toUpperCase() || (/PROCESSING FEE/i.test(clean(r[8])) ? "PROCESSING FEE" : "UNLABELLED");
    out.push({ account: info.account, tab, row: i + 1, date, tc, ref, particulars, plate: plateOf(r[4]), debit, credit, balance: parseMoney(clean(r[7])), remarks: clean(r[8]), type, mode: modeOf(tc, ref, particulars), note: clean(r[10]) });
  });
  return out;
}

// ---------------- the sales tabs ----------------

export type Stage = "reservation" | "additional" | "full" | "financing" | "split";
export const STAGE_LABEL: Record<Stage, string> = { reservation: "Reservation", additional: "Additional payment", full: "Full payment", financing: "Financing payout", split: "Split" };

export interface SalesTabInfo { month: string }
/** "SALES MONITORING NOVEMBER 2026", "BDO SALES MONITORING JULY 2026" → 2026-11 / 2026-07. Null for any other tab. */
export function salesTabInfo(name: string): SalesTabInfo | null {
  const m = /SALES\s+MONITORING\s+([A-Za-z]+)\s+(\d{4})/i.exec(name);
  return m && monthNo(m[1]) ? { month: key(Number(m[2]), monthNo(m[1])) } : null;
}

export interface SalePayment {
  tab: string; row: number; stage: Stage; buyer: string; plate: string; saleType: string; agreedPrice: number | null; bank: string; date: string | null; amount: number; arNo: string;
}

const STAGES: { stage: Stage; bank: number; date: number; amount: number; ar: number | null }[] = [
  { stage: "reservation", bank: 12, date: 13, amount: 14, ar: 15 },
  { stage: "additional", bank: 16, date: 17, amount: 18, ar: 19 },
  { stage: "full", bank: 20, date: 21, amount: 22, ar: 23 },
  { stage: "financing", bank: 24, date: 25, amount: 26, ar: null },
  { stage: "split", bank: 32, date: 33, amount: 34, ar: null },
];

/** The bank as staff write it ("BDO", "SECURITY BANK", "SB", "BPI"...), tidied so the same bank is one word. */
export function bankName(v: string | undefined): string {
  const t = clean(v).toUpperCase();
  if (!t) return "";
  if (/^(SB|SBTC|SECURITY\s*BANK)$/.test(t)) return "SECURITY BANK";
  return t;
}

/** The payments of every sale of one monthly tab: one entry for each stage that has an amount. */
export function parseSalesTab(rows: string[][], tab: string): SalePayment[] {
  const info = salesTabInfo(tab);
  const year = Number(info?.month.slice(0, 4)) || new Date().getFullYear();
  const out: SalePayment[] = [];
  rows.forEach((r, i) => {
    if (!/^\d+$/.test(clean(r[0]))) return; // the title rows and the empty rows at the end
    const buyer = clean(r[5]).toUpperCase(), plate = plateOf(r[10]);
    if (!buyer && !plate) return;
    const saleType = clean(r[2]).toUpperCase(), agreedPrice = parseMoney(clean(r[11]));
    for (const s of STAGES) {
      const amount = num(r[s.amount]);
      if (amount === null || amount <= 0) continue;
      out.push({ tab, row: i + 1, stage: s.stage, buyer, plate, saleType, agreedPrice, bank: bankName(r[s.bank]), date: parseSheetDate(clean(r[s.date]), year), amount, arNo: s.ar === null ? "" : clean(r[s.ar]) });
    }
  });
  return out;
}
