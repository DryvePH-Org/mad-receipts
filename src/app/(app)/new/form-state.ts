import type { AppSettings } from "@/lib/deal/settings";
import type { FormState, MethodRow, UnitInput } from "@/lib/deal/types";
import { fromCentavos, toCentavos } from "@/lib/rules/money";

export const emptyUnit = (): UnitInput => ({ makeType: "", plate: "", color: "" });
export const emptyMethod = (type: MethodRow["type"], name = ""): MethodRow => ({ type, name, amount: "", ref: "", checkNo: "", bank: "", branch: "", proofs: [] });

export function emptyForm(settings: AppSettings, today: string): FormState {
  return {
    receiptNo: "", date: today, receivedFrom: "", contact: "", address: "", kind: "partial", units: [emptyUnit()],
    price: "", sale: "cash", institution: "", dp: "", fee: "", monthly: "", years: "",
    hasTi: false, ti: { year: "", unit: "", plate: "", mileage: "", value: "" }, hasLieu: false, lieuAmount: "", lieuUntil: "",
    dueMode: "date", dueDate: "", dueText: "", earlier: "", cash: "", cashProofs: [], methods: [], payout: "", payoutProofs: [],
    hasRem: false, remarks: "", notes: settings.notes.map((n) => ({ text: n.text, on: n.on })),
  };
}

// ---- how the down payment and the processing fee are typed ----
//   Down payment: in pesos, as a percent of the price, or as the loan amount (the down payment is then price - loan).
//   Processing fee: in pesos, or as a percent of the loan.
// After switching how a value is typed, the exact pesos stay (a "lock") until the staff types something new,
// so ₱150,000 never drifts to 20.83% and back as ₱149,976.
export type DpMode = "amount" | "percent" | "loan";
export type FeeMode = "amount" | "percent";
interface Lock { mode: string; raw: string; cents: number; base: number }
export interface FinUi { dpMode: DpMode; dpIn: string; feeMode: FeeMode; feeIn: string; dpLock: Lock | null; feeLock: Lock | null; feeTouched: boolean; /** The staff picked "Other" for the fee, so any amount or percent is typed. */ feeOther: boolean }

export const emptyFin = (): FinUi => ({ dpMode: "amount", dpIn: "", feeMode: "percent", feeIn: "", dpLock: null, feeLock: null, feeTouched: false, feeOther: false });

const peso = (t: string) => toCentavos(t) ?? 0;
const pct = (t: string) => parseFloat(t.replace(/,/g, "")) || 0;
const c2 = (c: number) => (c > 0 ? fromCentavos(c) : "");

/** The down payment and fee in pesos, from how they were typed. */
export function resolveFinance(price: string, fin: FinUi): { dp: string; fee: string; dpC: number; feeC: number } {
  const P = peso(price);
  let dpC = 0;
  const dpRaw = fin.dpIn.trim();
  if (dpRaw) {
    if (fin.dpLock && fin.dpLock.mode === fin.dpMode && fin.dpLock.raw === dpRaw && fin.dpLock.base === P) dpC = fin.dpLock.cents;
    else dpC = fin.dpMode === "percent" ? Math.round((P * pct(dpRaw)) / 100) : fin.dpMode === "loan" ? Math.max(0, P - peso(dpRaw)) : peso(dpRaw);
  }
  const base = Math.max(0, P - dpC);
  let feeC = 0;
  const feeRaw = fin.feeIn.trim();
  if (feeRaw) {
    if (fin.feeLock && fin.feeLock.mode === fin.feeMode && fin.feeLock.raw === feeRaw && fin.feeLock.base === base) feeC = fin.feeLock.cents;
    else feeC = fin.feeMode === "percent" ? Math.round((base * pct(feeRaw)) / 100) : peso(feeRaw);
  }
  return { dp: c2(dpC), fee: c2(feeC), dpC, feeC };
}

const plain = (c: number) => (c ? String(c / 100) : "");
const percentOf = (x: number, of: number) => (of ? String(Math.round((x / of) * 10000) / 100) : "");

export function switchDpMode(price: string, fin: FinUi, mode: DpMode): FinUi {
  const P = peso(price), { dpC } = resolveFinance(price, fin);
  const set = dpC > 0 && fin.dpIn.trim() !== "";
  const share = Math.min(dpC, P);
  const dpIn = !set ? "" : mode === "percent" ? percentOf(share, P) : mode === "loan" ? plain(P - share) : plain(share);
  return { ...fin, dpMode: mode, dpIn, dpLock: set ? { mode, raw: dpIn, cents: dpC, base: P } : null, feeLock: fin.feeLock && { ...fin.feeLock, base: -1 } };
}

export function switchFeeMode(price: string, fin: FinUi, mode: FeeMode): FinUi {
  const { dpC, feeC } = resolveFinance(price, fin), loan = Math.max(0, peso(price) - dpC);
  const feeIn = feeC <= 0 || !fin.feeIn.trim() ? "" : mode === "percent" ? percentOf(feeC, loan) : plain(feeC);
  return { ...fin, feeMode: mode, feeIn, feeLock: feeC > 0 && feeIn ? { mode, raw: feeIn, cents: feeC, base: loan } : null };
}

/** Peso text as it is shown in a box: "720000" → "720,000". Anything else is left as typed. */
export function prettyMoney(text: string): string {
  const c = toCentavos(text);
  return c ? (c / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) : text;
}
export const cleanMoney = (text: string) => text.replace(/[^\d.,]/g, "");
export function prettyPhone(text: string): string {
  const d = text.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : text;
}
export const brandOf = (brands: Record<string, unknown>, makeType: string) => Object.keys(brands).find((b) => makeType.toLowerCase().includes(b.toLowerCase()));

import { buildLedger, buildSources, mathInputFromForm, totals, type Ledger, type LedgerInfo } from "@/lib/deal/math";
import { formatDate } from "@/lib/dates";

/** What the working-out needs besides the numbers: names, payment rows and proof counts. */
export function ledgerInfoFromForm(s: FormState): LedgerInfo {
  const payRows: LedgerInfo["payRows"] = [];
  if (peso(s.cash)) payRows.push({ label: "Cash", detail: "", amount: peso(s.cash), proofs: s.cashProofs.length });
  for (const m of s.methods) {
    if (!peso(m.amount)) continue;
    if (m.type === "check") payRows.push({ label: "Check", detail: [m.checkNo && `No. ${m.checkNo}`, m.bank, m.branch && `Br. ${m.branch}`].filter(Boolean).join(" · "), amount: peso(m.amount), proofs: m.proofs.length });
    else payRows.push({ label: m.name || "Other", detail: m.ref, amount: peso(m.amount), proofs: m.proofs.length });
  }
  return {
    units: s.units.length, institution: s.institution,
    tradeInText: [[s.ti.year, s.ti.unit].filter(Boolean).join(" "), s.ti.plate].filter(Boolean).join(" · "),
    payRows, payoutProofs: s.payoutProofs.length, lieuUntilText: s.lieuUntil ? formatDate(s.lieuUntil) : "",
  };
}

export function workOut(s: FormState): { t: ReturnType<typeof totals>; ledger: Ledger; sources: ReturnType<typeof buildSources> } {
  const t = totals(mathInputFromForm(s)), info = ledgerInfoFromForm(s);
  return { t, ledger: buildLedger(t, info), sources: buildSources(t, info) };
}
