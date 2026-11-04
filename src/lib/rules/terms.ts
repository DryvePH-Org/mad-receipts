import { formatPeso, fromCentavos, toCentavos } from "./money";

/**
 * How a deal is paid.
 *   cash       the buyer pays the whole price
 *   financing  a financing company pays the loan amount; the buyer pays the down payment (price - loan)
 *              plus a processing fee
 *   trade_in   the buyer hands in a car worth the trade-in value and pays the rest in cash
 * What the buyer owes MAD is the "amount due"; a deal is sold when that is fully paid.
 */
export type TransactionType = "cash" | "financing" | "trade_in";

export const TYPE_LABELS: Record<TransactionType, string> = {
  cash: "Cash",
  financing: "Financing",
  trade_in: "Trade-in",
};

/** The terms as typed in the form (text), so half-typed numbers are fine. */
export interface TermsValues {
  type: TransactionType;
  loan: string;
  fee: string;
  financier: string;
  tradeIn: string;
  tradeInDetails: string;
  /** Money received before this deal's first receipt in the app. New deals only. */
  paidBefore: string;
}

export const EMPTY_TERMS: TermsValues = { type: "cash", loan: "", fee: "", financier: "", tradeIn: "", tradeInDetails: "", paidBefore: "" };

/** The same terms with money as integer centavos. Only what belongs to the type counts. */
export interface Terms {
  type: TransactionType;
  agreedPrice: number;
  loan: number;
  fee: number;
  tradeIn: number;
  financier: string | null;
  tradeInDetails: string | null;
  paidBefore: number;
}

const money = (text: string) => (text.trim() ? toCentavos(text) : 0);

/** Reads the form text. Money that cannot be read becomes null so the form can say so. */
export function parseTerms(values: TermsValues, agreedPrice: number): { terms: Terms; unreadable: (keyof TermsValues)[] } {
  const unreadable: (keyof TermsValues)[] = [];
  const read = (key: "loan" | "fee" | "tradeIn" | "paidBefore") => {
    const v = money(values[key]);
    if (v === null) unreadable.push(key);
    return v ?? 0;
  };
  const financing = values.type === "financing";
  const tradeIn = values.type === "trade_in";
  const terms: Terms = {
    type: values.type,
    agreedPrice,
    loan: financing ? read("loan") : 0,
    fee: financing ? read("fee") : 0,
    tradeIn: tradeIn ? read("tradeIn") : 0,
    financier: financing ? values.financier.trim() || null : null,
    tradeInDetails: tradeIn ? values.tradeInDetails.trim() || null : null,
    paidBefore: read("paidBefore"),
  };
  return { terms, unreadable };
}

/** What the buyer owes MAD: price - trade-in - loan + processing fee. */
export const amountDue = (t: Pick<Terms, "agreedPrice" | "tradeIn" | "loan" | "fee">) => t.agreedPrice - t.tradeIn - t.loan + t.fee;

/** The buyer's down payment on a financed car: the price minus what the loan covers. */
export const downPayment = (t: Pick<Terms, "agreedPrice" | "loan">) => t.agreedPrice - t.loan;

export interface TermsIssue {
  field: keyof TermsValues;
  level: "error" | "warning";
  message: string;
}

/** Problems with the terms themselves (the payment against them is checked by computePayment). */
export function validateTerms(t: Terms, unreadable: (keyof TermsValues)[] = []): TermsIssue[] {
  const issues: TermsIssue[] = [];
  const error = (field: keyof TermsValues, message: string) => issues.push({ field, level: "error", message });
  const warning = (field: keyof TermsValues, message: string) => issues.push({ field, level: "warning", message });

  for (const field of unreadable) error(field, "Not a valid amount. Use numbers only, e.g. 130000.");
  if (t.agreedPrice <= 0) return issues; // the price itself is reported elsewhere

  if (t.type === "financing") {
    if (!unreadable.includes("loan")) {
      if (t.loan <= 0) error("loan", "Enter the loan amount the financing company will pay.");
      else if (t.loan >= t.agreedPrice) error("loan", "The loan must be less than the agreed price.");
    }
    if (!t.financier && t.loan > 0 && t.loan < t.agreedPrice) warning("financier", "Add the financing company's name (for example BPI or GDFI).");
  }
  if (t.type === "trade_in") {
    if (!unreadable.includes("tradeIn")) {
      if (t.tradeIn <= 0) error("tradeIn", "Enter the value given for the traded car.");
      else if (t.tradeIn >= t.agreedPrice) error("tradeIn", "The trade-in value must be less than the agreed price.");
    }
    if (!t.tradeInDetails && t.tradeIn > 0 && t.tradeIn < t.agreedPrice) warning("tradeInDetails", "Describe the traded car (make, model, plate).");
  }
  if (!issues.some((i) => i.level === "error") && amountDue(t) <= 0) error("loan", "Nothing is left for the buyer to pay with these amounts.");
  return issues;
}

/** The JSON fields confirm_receipt and update_deal_details take (money as pesos text). */
export function termsPayload(t: Terms) {
  return {
    transaction_type: t.type,
    trade_in_value: fromCentavos(t.tradeIn),
    trade_in_details: t.tradeInDetails,
    loan_amount: fromCentavos(t.loan),
    processing_fee: fromCentavos(t.fee),
    financier: t.financier,
  };
}

/** One line for lists and messages: "Financing: loan ₱130,000 (GDFI) + fee ₱10,000". */
export function describeTerms(t: Pick<Terms, "type" | "loan" | "fee" | "tradeIn" | "financier" | "tradeInDetails">): string {
  if (t.type === "financing") {
    const who = t.financier ? ` (${t.financier})` : "";
    return `Financing: loan ${formatPeso(t.loan)}${who}${t.fee > 0 ? ` + fee ${formatPeso(t.fee)}` : ""}`;
  }
  if (t.type === "trade_in") {
    return `Trade-in: ${formatPeso(t.tradeIn)}${t.tradeInDetails ? ` (${t.tradeInDetails})` : ""} + cash`;
  }
  return "Cash";
}
