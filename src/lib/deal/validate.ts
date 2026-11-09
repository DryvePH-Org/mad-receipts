import { formatPeso, toCentavos } from "@/lib/rules/money";
import type { AppSettings } from "./settings";
import { mathInputFromForm, totals, type Totals } from "./math";
import type { FormState } from "./types";

export type Step = 1 | 2 | 3 | 4;
export interface Missing {
  step: Step;
  label: string;
  /** The id of the field to jump to. */
  target: string;
}
export interface Warning {
  step: Step;
  text: string;
}

const peso = (v: string) => toCentavos(v) ?? 0;
export const unitFieldId = (i: number, key: string) => `unit-${i}-${key}`;

/** What stops a receipt from being sent for approval. The server runs the same check. */
export function missingFields(s: FormState, t: Totals, settings: AppSettings, opts: { continuing: boolean; duplicateDeal?: string }): Missing[] {
  const m: Missing[] = [];
  const add = (step: Step, label: string, target: string) => m.push({ step, label, target });
  const req = settings.required;
  if (!s.receiptNo.trim()) add(1, "Receipt number", "receiptNo");
  if (!s.receivedFrom.trim()) add(1, "Received from", "receivedFrom");
  const digits = s.contact.replace(/\D/g, "");
  const phoneOk = /^09\d{9}$/.test(digits);
  if (req.contact ? !phoneOk : digits && !phoneOk) add(1, "Contact number (11 digits)", "contact");
  if (req.address && !s.address.trim()) add(1, "Postal address", "address");
  s.units.forEach((u, i) => {
    const p = s.units.length > 1 ? `Unit ${i + 1}: ` : "";
    if (!u.makeType.trim()) add(2, `${p}Make / type`, unitFieldId(i, "makeType"));
    if (!u.plate.trim()) add(2, `${p}Plate number`, unitFieldId(i, "plate"));
    if (req.color && !u.color.trim()) add(2, `${p}Color`, unitFieldId(i, "color"));
  });
  if (opts.duplicateDeal) add(2, `This car already has an open deal (${opts.duplicateDeal}). Use “Continue this deal” at the top`, "deal-banner");
  if (!t.price) add(3, "Agreed price", "price");
  if (s.sale === "financing") {
    if (!s.institution.trim()) add(3, "Financing institution", "institution");
    if (!t.dpSet) add(3, "Down payment or loan amount", "dpIn");
    if (t.price && t.dp > t.price) add(3, "Down payment is more than the agreed price", "dpIn");
    else if (t.dpSet && t.tv > t.share) add(3, `The trade-in (${formatPeso(t.tv)}) is worth more than the down payment. Raise the down payment to at least ${formatPeso(t.tv)}`, "dpIn");
  }
  if (s.hasTi) {
    if (!s.ti.unit.trim()) add(3, "Trade-in unit", "tiUnit");
    if (!peso(s.ti.value)) add(3, "Trade-in value", "tiValue");
  }
  if (s.hasLieu) {
    if (!peso(s.lieuAmount)) add(3, "In-lieu amount", "lieuAmount");
    if (!s.lieuUntil) add(3, "In-lieu until date", "lieuUntil");
    // the documents stand in for part of what the buyer owes, so they cannot be worth more than that
    if (peso(s.lieuAmount) && t.due < 0) add(3, `In-lieu amount (more than the buyer owes: ${formatPeso(t.due + t.lieu)})`, "lieuAmount");
  }
  if (!t.today && t.due > 0) add(4, "Amount paid today", "cash");
  const dueText = s.dueMode === "date" ? s.dueDate : s.dueText.trim();
  if (t.balance > 0 && !dueText) add(4, "When the balance will be given", s.dueMode === "date" ? "dueDate" : "dueText");
  s.methods.forEach((x, i) => {
    if (x.type === "wallet" && peso(x.amount) && !x.name.trim()) add(4, "Name of a payment method", `method-${i}-name`);
    if (settings.required.proofs && peso(x.amount) && x.proofs.length === 0) add(4, `Proof for ${x.type === "check" ? "the check" : x.name || "the payment"}`, `method-${i}-proof`);
  });
  if (settings.required.proofs && peso(s.cash) && s.cashProofs.length === 0) add(4, "Photo of the cash", "cash-proof");
  if (settings.required.proofs && t.payout && s.payoutProofs.length === 0) add(4, "Proof of the payout to the buyer", "payout-proof");
  if (t.due >= 0 && t.balance < 0) add(4, `Received is more than is due (overpaid by ${formatPeso(-t.balance)})`, "cash");
  if (t.due < 0 && t.balance > 0) add(4, "The payout is more than we owe the buyer", "payout");
  if (t.payout > 0 && t.due >= 0) add(4, "A payout only applies when we owe the buyer", "payout");
  return m;
}

/** Things worth a second look. They never stop saving. */
export function warningsFor(s: FormState, t: Totals, settings: AppSettings): Warning[] {
  const w: Warning[] = [];
  const add = (step: Step, text: string) => w.push({ step, text });
  const minDown = Number(settings.minDownPct) || 20;
  if (s.sale === "financing" && t.dpSet && t.price && (t.share / t.price) * 100 < minDown) add(3, `The down payment is only ${Math.round((t.share / t.price) * 1000) / 10}% of the price. Most lenders ask for at least ${minDown}%, so the loan may not be approved.`);
  if (s.sale === "financing" && t.loan && t.fee && (t.fee / t.loan) * 100 > 15) add(3, `The processing fee is ${Math.round((t.fee / t.loan) * 10000) / 100}% of the loan, much more than the usual ${settings.feeStd}%.`);
  if (s.sale === "financing" && t.dpSet && t.loan && (!t.monthly || !t.years)) add(3, "Monthly payment or years to pay are not filled in.");
  if (s.sale === "financing" && t.loan && t.repay && t.repay < t.loan) add(3, `${formatPeso(t.monthly)} × ${t.months} months is ${formatPeso(t.repay)}, which does not even cover the ${formatPeso(t.loan)} loan.`);
  if (s.hasTi && s.sale !== "financing" && t.due < 0) add(3, `The trade-in is worth more than the price, so we pay the buyer ${formatPeso(-t.due)}.`);
  if (s.hasLieu && s.lieuUntil && s.date && s.lieuUntil < s.date) add(3, "The in-lieu date is before the receipt date.");
  if (t.due < 0 && t.today > 0) add(4, "Nothing is due from the buyer, but a payment is recorded.");
  if (t.due < 0 && t.balance < 0) add(4, `We still owe the buyer ${formatPeso(-t.balance)}. Record the payout once it is paid.`);
  if (s.methods.some((x) => x.type === "check" && peso(x.amount) && !x.checkNo.trim())) add(4, "A check has no check number.");
  if (s.methods.some((x) => !peso(x.amount) && x.type === "wallet" && (x.name.trim() || x.ref.trim()))) add(4, "A payment row has no amount.");
  if (s.dueMode === "date" && s.dueDate && s.date && t.balance > 0 && s.dueDate < s.date) add(4, "The balance date is before the receipt date.");
  if (s.kind === "full" && t.balance > 0) add(4, `Marked full payment, but ${formatPeso(t.balance)} is still left.`);
  if (s.kind !== "full" && t.price && t.due > 0 && t.balance === 0) add(4, `The buyer's part is fully paid. ${s.sale === "financing" ? `Full payment is right here: the loan is between the buyer and ${s.institution || "the lender"}.` : "Should this be full payment?"}`);
  return w;
}

export const totalsOf = (s: FormState) => totals(mathInputFromForm(s));
