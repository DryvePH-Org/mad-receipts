import { z } from "zod";
import { toCentavos } from "@/lib/rules/money";
import type { PaymentType } from "@/lib/rules/payment";
import { normalizePlate, type ReceiptFields } from "@/lib/rules/validate";

// Every field is nullable. A field the model returns in the wrong shape becomes
// null (shown as blank on the review screen) rather than failing the whole receipt.

const text = z
  .unknown()
  .transform((v) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : ""))
  .transform((s) => (s === "" || /^(null|n\/?a|none|-+)$/i.test(s) ? null : s.slice(0, 500)));

/** Pesos as a plain number, e.g. 50000 or 1500.5. Accepts "50,000" style strings too. */
const pesos = z.unknown().transform((v) => {
  if (typeof v !== "number" && typeof v !== "string") return null;
  const centavos = toCentavos(v);
  return centavos === null ? null : centavos / 100;
});

/** YYYY-MM-DD that is a real calendar date. */
const date = z.unknown().transform((v) => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const parsed = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(v) ? v : null;
});

const paymentType = z.unknown().transform((v): PaymentType | null => {
  const s = typeof v === "string" ? v.toLowerCase() : "";
  if (s.startsWith("earnest")) return "earnest";
  if (s.startsWith("partial")) return "partial";
  if (s.startsWith("full")) return "full";
  return null;
});

const paymentMethod = z.unknown().transform((v): "cash" | "check" | null => {
  const s = typeof v === "string" ? v.toLowerCase().trim() : "";
  if (s === "cash") return "cash";
  if (s === "check" || s === "cheque") return "check";
  return null;
});

const plate = text.transform((s) => normalizePlate(s) || null);

const shape = {
  receipt_no: text,
  receipt_date: date,
  buyer_name: text,
  buyer_address: text,
  buyer_contact: text,
  amount_words: text,
  amount: pesos,
  paper_payment_type: paymentType,
  make_type: text,
  plate_no: plate,
  motor_no: text,
  chassis_no: text,
  color: text,
  agreed_price: pesos,
  less_payment: pesos,
  balance: pesos,
  payment_method: paymentMethod,
  check_no: text,
  bank_branch: text,
  balance_words: text,
  balance_amount: pesos,
  balance_due_date: date,
};

export const EXTRACTED_FIELDS = Object.keys(shape) as (keyof typeof shape)[];

// Keys the model left out count as blank. Anything that is not an object fails (and is retried).
export const ExtractedReceipt = z.preprocess(
  (v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(EXTRACTED_FIELDS.map((k) => [k, (v as Record<string, unknown>)[k] ?? null]))
      : v,
  z.object(shape),
);

export type ExtractedReceipt = z.output<typeof ExtractedReceipt>;

/** Converts pesos from the model into integer centavos for the rules engine. */
export function toReceiptFields(data: ExtractedReceipt): ReceiptFields {
  const c = (v: number | null) => (v === null ? null : toCentavos(v));
  return {
    ...data,
    amount: c(data.amount),
    agreed_price: c(data.agreed_price),
    less_payment: c(data.less_payment),
    balance: c(data.balance),
    balance_amount: c(data.balance_amount),
  };
}
