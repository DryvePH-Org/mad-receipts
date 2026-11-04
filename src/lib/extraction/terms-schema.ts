import { z } from "zod";
import { pesos, text } from "./schema";

/**
 * A suggestion for how a deal is paid, from the photo or from a voice note. Every part is optional:
 * a blank means "not said". Staff always see and can change it before confirming.
 */
const type = z.unknown().transform((v): "cash" | "financing" | "trade_in" | null => {
  const s = typeof v === "string" ? v.toLowerCase().replace(/[^a-z]/g, "") : "";
  if (s === "cash" || s === "straightpayment" || s === "straight") return "cash";
  if (s.startsWith("financ") || s === "loan" || s === "bankloan") return "financing";
  if (s.startsWith("tradein") || s === "trade") return "trade_in";
  return null;
});

const shape = {
  transaction_type: type,
  loan_amount: pesos,
  processing_fee: pesos,
  trade_in_value: pesos,
  trade_in_details: text,
  financier: text,
  paid_before: pesos,
};

export const TERMS_KEYS = Object.keys(shape) as (keyof typeof shape)[];

export const TermsSuggestion = z.preprocess(
  (v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(TERMS_KEYS.map((k) => [k, (v as Record<string, unknown>)[k] ?? null]))
      : Object.fromEntries(TERMS_KEYS.map((k) => [k, null])),
  z.object(shape),
);

export type TermsSuggestion = z.output<typeof TermsSuggestion>;

export const NO_TERMS: TermsSuggestion = TermsSuggestion.parse({});
