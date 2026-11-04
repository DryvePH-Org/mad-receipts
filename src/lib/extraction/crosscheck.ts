import { FIELD_KEYS, sameValue, toFormValues, type Field } from "./merge";
import type { ExtractedReceipt } from "./schema";

/**
 * Two independent readings of the same photo (different size, stricter instructions). Where they agree
 * the value is kept. Where they disagree the AI itself is not sure, so the field is left blank and both
 * readings are offered as choices: only a value staff pick or type goes into the receipt.
 * Not compared: the type ticked on paper (the numbers decide it) and the amount in words (spelling varies).
 */
const NOT_COMPARED: Field[] = ["paper_payment_type", "amount_words", "balance_words"];

export type Uncertain = Partial<Record<Field, string[]>>;

export function crossCheck(first: ExtractedReceipt, second: ExtractedReceipt | null): { fields: ExtractedReceipt; uncertain: Uncertain } {
  if (!second) return { fields: first, uncertain: {} };
  const a = toFormValues(first);
  const b = toFormValues(second);
  const fields = { ...first };
  const uncertain: Uncertain = {};
  for (const key of FIELD_KEYS) {
    if (NOT_COMPARED.includes(key)) continue;
    const x = a[key].trim();
    const y = b[key].trim();
    if (!x && !y) continue;
    if (x && y && sameValue(key, x, y)) continue;
    uncertain[key] = [...new Set([x, y].filter(Boolean))];
    (fields as Record<string, unknown>)[key] = null;
  }
  return { fields, uncertain };
}
