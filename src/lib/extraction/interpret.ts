import "server-only";
import { callGroqJson } from "./groq";
import { NO_TERMS, TermsSuggestion } from "./terms-schema";
import type { ExtractedReceipt } from "./schema";

const PROMPT = `You help a Philippine car dealership (Manila Auto Display, "MAD") record how a car sale is paid. You are given what was read from one handwritten Acknowledgement of Payment, as JSON, plus words copied from the balance lines.

Return ONLY a JSON object:
{
  "transaction_type": "cash" | "financing" | "trade_in" | null,
  "loan_amount": number | null,
  "financier": string | null,
  "processing_fee": number | null,
  "trade_in_value": number | null,
  "trade_in_details": string | null
}

Rules:
- Use only what the paper says. NEVER guess or invent. If unsure, use null.
- "financing" only when the paper gives a loan amount that a financing company or bank will pay, for example a balance line like "Mad: 0  Gdfi: 130,000" (MAD's own balance is 0 and the financing company GDFI pays 130,000). Then loan_amount is that number (130000) and financier is the name beside it (GDFI). The "Bank/Br." line is only where the payment was made: do NOT use it as the financier unless no other name is written.
- "Upon approval of financing" with no loan amount is NOT enough: leave everything null (the sale type is decided when the loan is approved).
- "trade_in" only when the paper mentions a trade-in or a car handed in, with its value. Then trade_in_value and trade_in_details (the car) if written.
- processing_fee only if a processing fee amount is written. Otherwise null.
- Plain cash receipts with nothing special: return all null.
- Amounts are plain numbers (130000), no commas or symbols.`;

/** True when the paper carries something beyond a plain cash receipt, so the extra reasoning is worth its time. */
function worthInterpreting(fields: ExtractedReceipt, hints: string): boolean {
  if (hints.trim()) return true;
  if (/\d/.test(fields.balance_words ?? "")) return true;
  if (fields.balance === null && fields.balance_amount === null && fields.balance_words) return true;
  return false;
}

/**
 * Asks the reasoning model what kind of sale this is. It only suggests: it never changes the fields
 * that were read, and if it fails or says nothing the review screen simply starts as a cash sale.
 */
export async function interpretTerms(fields: ExtractedReceipt, hints: string): Promise<TermsSuggestion> {
  const paidBefore = priorPayments(fields);
  const base = paidBefore === null ? NO_TERMS : { ...NO_TERMS, paid_before: paidBefore };
  if (!worthInterpreting(fields, hints)) return base;
  try {
    const payload = {
      agreed_price: fields.agreed_price,
      amount_paid_now: fields.amount,
      less_payment: fields.less_payment,
      balance: fields.balance,
      balance_line_words: fields.balance_words,
      bank_branch: fields.bank_branch,
      words_copied_from_paper: hints,
    };
    const raw = await callGroqJson(PROMPT, JSON.stringify(payload));
    const parsed = TermsSuggestion.safeParse(JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")));
    if (!parsed.success) return base;
    return { ...parsed.data, paid_before: paidBefore };
  } catch {
    return base;
  }
}

/** "Less payment" on the paper includes this payment; what is above it was paid earlier. */
export function priorPayments(fields: Pick<ExtractedReceipt, "less_payment" | "amount">): number | null {
  const { less_payment: less, amount } = fields;
  if (less === null || amount === null || less <= amount) return null;
  return Math.round((less - amount) * 100) / 100;
}
