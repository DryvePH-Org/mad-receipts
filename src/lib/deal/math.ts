import { formatPeso, toCentavos } from "@/lib/rules/money";
import { amountToWords } from "@/lib/rules/words";
import type { FormState, MathInput } from "./types";

/*
 * The money rules, in one place. The database applies the same rules (submit_receipt), and the
 * tests check both against an independent calculation.
 *
 *   Agreed price                                   P
 *   - trade-in value (the buyer's old car)         T   not cash, so never part of the balance
 *   - loan (financing: price - down payment)       L   paid to us by the lender, not by the buyer
 *   + processing fee (financing only)              F   paid by the buyer on top of the down payment
 *   - in lieu of documents                         Z   the documents the buyer leaves with us in place of that part of the payment
 *   = amount due from the buyer in cash            D   = (down payment, or the price for cash) - T + F - Z
 *                                                      (negative: we pay the buyer; never with a fee; Z can never take it below zero)
 *   - earlier payments - payments today            R
 *   + paid out to the buyer (only when D < 0)      X
 *   = balance                                      D - R + X        and always:  P + F = T + L + Z + R - X + balance
 *
 *   The processing fee is part of what the buyer pays, so earnest money, the down payment and the
 *   fee are all deducted from the same balance.

 *   In lieu of documents: we hold the buyer's documents in place of paying that amount now, so it is taken off the balance
 *   like a payment (no money moves, and the amount to be paid on or before its date is kept with the deal).
 */

export interface Totals {
  price: number;
  tv: number;
  dp: number;
  dpSet: boolean;
  /** What the buyer owes before the trade-in: the down payment (financing) or the price (cash). */
  share: number;
  loan: number;
  fee: number;
  due: number;
  today: number;
  earlier: number;
  paid: number;
  payout: number;
  balance: number;
  lieu: number;
  years: number;
  monthly: number;
  months: number;
  repay: number;
}

export function totals(m: MathInput): Totals {
  const financing = m.sale === "financing";
  const dpSet = financing && m.dp > 0;
  const share = dpSet ? Math.min(m.dp, m.price) : m.price;
  const loan = dpSet ? m.price - share : 0;
  const fee = financing ? m.fee : 0;
  const due = share - m.tradeIn + fee - m.lieu;
  const paid = m.earlier + m.today;
  const payout = due < 0 ? m.payout : 0;
  return {
    price: m.price, tv: m.tradeIn, dp: financing ? m.dp : 0, dpSet, share, loan, fee, due,
    today: m.today, earlier: m.earlier, paid, payout, balance: due - paid + payout, lieu: m.lieu,
    years: m.years, monthly: m.monthly, months: m.years * 12, repay: Math.round(m.monthly * m.years * 12),
  };
}

export type BalanceTone = "owe" | "ok" | "we" | "bad";
export interface BalanceInfo {
  label: string;
  note: string;
  /** Always positive. */
  amount: number;
  tone: BalanceTone;
}

export function balanceInfo(t: Pick<Totals, "balance" | "due">): BalanceInfo {
  if (t.balance > 0) return { label: "Balance", note: "the buyer still owes this", amount: t.balance, tone: "owe" };
  if (t.balance === 0) return { label: "Balance", note: t.due < 0 ? "settled with the buyer" : "paid in full", amount: 0, tone: "ok" };
  if (t.due < 0) return { label: "We still owe the buyer", note: "the trade-in is worth more than what the buyer must pay", amount: -t.balance, tone: "we" };
  return { label: "Overpaid by", note: "more was received than the buyer owes", amount: -t.balance, tone: "bad" };
}

const peso = (text: string) => toCentavos(text) ?? 0;

/** The money rules' input, read from what staff typed. Amounts the form cannot read count as zero. */
export function mathInputFromForm(s: FormState): MathInput {
  const today = peso(s.cash) + s.methods.reduce((n, m) => n + peso(m.amount), 0);
  return {
    price: peso(s.price), sale: s.sale, dp: peso(s.dp), fee: peso(s.fee), tradeIn: s.hasTi ? peso(s.ti.value) : 0,
    earlier: peso(s.earlier), today, payout: peso(s.payout), lieu: s.hasLieu ? peso(s.lieuAmount) : 0,
    monthly: peso(s.monthly), years: Number(s.years) > 0 ? Number(s.years) : 0,
  };
}

export const totalsFromForm = (s: FormState) => totals(mathInputFromForm(s));

// ---------------- the working-out, line by line ----------------

export type RowKind = "plus" | "less" | "sub" | "total";
export interface LedgerRow {
  kind: RowKind;
  label: string;
  detail?: string;
  note?: string;
  /** Always positive; the kind says whether it adds or takes away. */
  amount: number;
  tone?: BalanceTone | "we";
  stage: "deal" | "pay";
}
export interface LedgerPayRow {
  label: string;
  detail: string;
  amount: number;
  proofs: number;
}
export interface LedgerInfo {
  units: number;
  institution: string;
  tradeInText: string;
  payRows: LedgerPayRow[];
  payoutProofs: number;
  lieuUntilText: string;
}
export interface Ledger {
  totals: Totals;
  rows: LedgerRow[];
  balance: BalanceInfo;
  /** price = trade-in + loan + received - payout + balance */
  proves: boolean;
  proof: string;
  info: { label: string; text: string }[];
}

const proofText = (n: number) => (n ? `Proof: ${n} ${n === 1 ? "file" : "files"}` : "No proof attached yet");

export function buildLedger(t: Totals, info: LedgerInfo): Ledger {
  const rows: LedgerRow[] = [];
  const add = (r: Omit<LedgerRow, "stage">) => rows.push({ ...r, stage: "deal" });
  add({ kind: "plus", label: `Agreed price${info.units > 1 ? ` for ${info.units} units` : ""}`, amount: t.price });
  if (t.tv) add({ kind: "less", label: "Trade-in value", detail: info.tradeInText, note: "The buyer's old car. It lowers what they pay, so it is not part of the balance.", amount: t.tv });
  if (t.loan) add({ kind: "less", label: `Loan paid by ${info.institution || "the lender"}`, detail: `Price ${formatPeso(t.price)} − down payment ${formatPeso(t.dp)}`, note: "The lender pays this, so it is not part of the balance.", amount: t.loan });
  if (t.fee) add({ kind: "plus", label: "Processing fee", detail: t.loan ? `${Math.round((t.fee / t.loan) * 10000) / 100}% of the loan` : undefined, note: "Paid by the buyer on top of the down payment, so it is part of the balance.", amount: t.fee });
  if (t.lieu) add({ kind: "less", label: "In lieu of documents", detail: info.lieuUntilText ? `Held until ${info.lieuUntilText}` : undefined, note: "The buyer leaves documents with us in place of paying this now, so it is taken off the balance.", amount: t.lieu });
  add({
    kind: "sub",
    label: t.due < 0 ? "We pay the buyer" : "Buyer must pay us in cash",
    note: t.due < 0 ? "The trade-in is worth more than the buyer's share of the price"
      : t.dpSet ? `${t.tv ? "Down payment less the trade-in" : "The down payment"}${t.fee ? ", plus the processing fee" : ""}${t.lieu ? ", less the documents held" : ""}` : t.tv ? "Price less the trade-in" : "The agreed price",
    amount: Math.abs(t.due), tone: t.due < 0 ? "we" : undefined,
  });
  const firstPay = rows.length;
  const pay = (r: Omit<LedgerRow, "stage">) => rows.push({ ...r, stage: "pay" });
  if (t.earlier) pay({ kind: "less", label: "Earlier payments", note: "Received before this receipt", amount: t.earlier });
  for (const r of info.payRows) pay({ kind: "less", label: `Paid today · ${r.label}`, detail: [r.detail, proofText(r.proofs)].filter(Boolean).join(" · "), amount: r.amount });
  if (t.earlier || t.today) pay({ kind: "sub", label: "Total received", note: t.earlier && t.today ? `Earlier ${formatPeso(t.earlier)} + today ${formatPeso(t.today)}` : "", amount: t.paid });
  if (t.payout) pay({ kind: "plus", label: "Paid out to the buyer", detail: proofText(info.payoutProofs), note: "Cash we handed to the buyer, because the trade-in is worth more than their share. It settles what we owe.", amount: t.payout });
  const b = balanceInfo(t);
  pay({ kind: "total", label: b.label, note: b.note, amount: b.amount, tone: b.tone });
  void firstPay;

  const proves = t.price > 0 && t.tv + t.loan + t.lieu + t.paid - t.payout + t.balance === t.price + t.fee;
  const text: { label: string; text: string }[] = [];
  if (t.dpSet) text.push({ label: "Down payment", text: `${formatPeso(t.dp)} · ${t.price ? Math.round((Math.min(t.dp, t.price) / t.price) * 1000) / 10 : 0}% of the price` });
  if (t.monthly && t.years) text.push({ label: `Loan repayment to ${info.institution || "the lender"}`, text: `${formatPeso(t.monthly)} × ${t.months} months = ${formatPeso(t.repay)}. Paid by the buyer to the lender, not to us.` });
  if (t.fee) text.push({ label: "Processing fee", text: `${formatPeso(t.fee)}${t.loan ? ` (${Math.round((t.fee / t.loan) * 10000) / 100}% of the loan)` : ""}. Paid by the buyer on top of the down payment, so it is in the balance.` });
  if (t.loan) text.push({ label: `Loan from ${info.institution || "the lender"}`, text: `${formatPeso(t.loan)} is paid to us by the lender, not by the buyer, so it is not in the balance. What the buyer pays the lender afterwards is between them.` });
  if (t.lieu) text.push({ label: "In lieu of documents", text: `We hold the buyer's documents until ${info.lieuUntilText || "the date given"} in place of ${formatPeso(t.lieu)}. No money is received, but the amount is taken off the balance like a payment.` });
  return {
    totals: t, rows, balance: b, proves,
    proof: `${formatPeso(t.price + t.fee)}${t.fee ? ` (price ${formatPeso(t.price)} + fee ${formatPeso(t.fee)})` : ""} = ${[t.tv && `trade-in ${formatPeso(t.tv)}`, t.loan && `loan ${formatPeso(t.loan)}`, t.lieu && `in lieu of documents ${formatPeso(t.lieu)}`, `received ${formatPeso(t.paid)}`, t.payout && `paid out −${formatPeso(t.payout)}`, `balance ${formatPeso(t.balance)}`].filter(Boolean).join(" + ").replace("+ paid out", "")}`,
    info: text,
  };
}

/** Who pays for the price and the fee: the buyer in cash, the buyer's old car, and the lender. They add up to the price plus the fee. */
export function buildSources(t: Totals, info: { institution: string; tradeInText: string }) {
  const b = balanceInfo(t);
  const rows: { label: string; note: string; amount: number }[] = [
    { label: "Buyer, in cash", note: t.paid || t.payout ? `${formatPeso(t.paid)} received${t.payout ? `, ${formatPeso(t.payout)} paid out` : ""}, ${b.label.toLowerCase()} ${formatPeso(b.amount)}` : "Nothing received yet", amount: t.due - t.fee },
  ];
  if (t.fee) rows.push({ label: "Processing fee", note: "Paid by the buyer, on top of the cash above", amount: t.fee });
  if (t.lieu) rows.push({ label: "Documents held in lieu", note: "The buyer's documents, kept in place of this amount", amount: t.lieu });
  if (t.tv) rows.push({ label: "Trade-in car", note: info.tradeInText || "The buyer's old car", amount: t.tv });
  if (t.loan) rows.push({ label: info.institution ? `Lender: ${info.institution}` : "Lender", note: "Pays the loan to us after approval", amount: t.loan });
  const total = rows.reduce((n, r) => n + r.amount, 0);
  return { rows, total, totalLabel: t.fee ? "Agreed price + processing fee" : "Agreed price", proves: t.price > 0 && total === t.price + t.fee };
}

export const words = (centavos: number) => (centavos > 0 ? amountToWords(centavos) : "");
