import { fromCentavos, toCentavos } from "@/lib/rules/money";
import { normalizePlate } from "@/lib/rules/validate";
import { wordsToCentavos } from "@/lib/rules/words";
import { normalizeName } from "@/lib/salespeople/names";
import type { ExtractedReceipt } from "./schema";

// Cross-checking what the photo, the voice note and staff typing say about the same receipt.
// Typed values always win. A blank field takes the voice value. When photo and voice both have a
// value and they differ, staff are asked to pick one (a "conflict").

export type Field = keyof ExtractedReceipt;
export type FormValues = Record<Field, string>;
export type Source = "photo" | "voice" | "typed";
export type Sources = Partial<Record<Field, Source>>;

const MONEY: Field[] = ["amount", "agreed_price", "less_payment", "balance", "balance_amount"];
const WORDS: Field[] = ["amount_words", "balance_words"];
const CODES: Field[] = ["receipt_no", "check_no", "motor_no", "chassis_no"];

export const FIELD_KEYS: Field[] = [
  "receipt_no", "receipt_date", "buyer_name", "buyer_address", "buyer_contact", "amount_words", "amount",
  "paper_payment_type", "make_type", "plate_no", "motor_no", "chassis_no", "color", "agreed_price", "less_payment",
  "balance", "payment_method", "check_no", "bank_branch", "balance_words", "balance_amount", "balance_due_date",
];

/** Extracted values as form text: pesos without trailing ".00", blanks as "". */
export function toFormValues(data: Partial<ExtractedReceipt> | null | undefined): FormValues {
  const values = {} as FormValues;
  for (const key of FIELD_KEYS) {
    const v = data?.[key] ?? null;
    if (typeof v === "number") {
      const centavos = toCentavos(v);
      values[key] = centavos === null ? "" : fromCentavos(centavos).replace(/\.00$/, "");
    } else {
      values[key] = v ?? "";
    }
  }
  return values;
}

const alnum = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Whether two filled-in values for a field say the same thing, ignoring formatting. */
export function sameValue(field: Field, a: string, b: string): boolean {
  if (field === "plate_no") return normalizePlate(a) === normalizePlate(b);
  if (CODES.includes(field)) return alnum(a) === alnum(b);
  if (field === "buyer_contact") return a.replace(/\D/g, "") === b.replace(/\D/g, "");
  if (MONEY.includes(field)) {
    const x = toCentavos(a);
    const y = toCentavos(b);
    return x !== null && y !== null ? x === y : a.trim() === b.trim();
  }
  if (WORDS.includes(field)) {
    const x = wordsToCentavos(a);
    const y = wordsToCentavos(b);
    return (x !== null && x === y) || normalizeName(a) === normalizeName(b);
  }
  if (field === "receipt_date" || field === "balance_due_date" || field === "paper_payment_type" || field === "payment_method") {
    return a.trim() === b.trim();
  }
  return normalizeName(a) === normalizeName(b);
}

export interface Conflict {
  field: Field;
  /** What the form has now, and where it came from. */
  current: string;
  currentSource: Source;
  voice: string;
}

export interface VoiceMerge {
  /** Fields to set on the form (blank fields the voice filled in). */
  values: Partial<FormValues>;
  sources: Sources;
  /** The photo (or earlier text) and the voice disagree: staff choose. */
  conflicts: Conflict[];
  /** Photo and voice both gave the same value. */
  agreed: Field[];
}

/** Applies what the voice note said to the form, without ever overwriting what staff typed. */
export function mergeVoice(current: FormValues, sources: Sources, voice: Partial<ExtractedReceipt>): VoiceMerge {
  const heard = toFormValues(voice);
  const result: VoiceMerge = { values: {}, sources: {}, conflicts: [], agreed: [] };

  for (const field of FIELD_KEYS) {
    const said = heard[field].trim();
    if (!said) continue;

    const have = current[field];
    const source = sources[field];
    if (source === "typed") continue; // typed wins

    if (!have.trim()) {
      result.values[field] = said;
      result.sources[field] = "voice";
    } else if (sameValue(field, have, said)) {
      result.agreed.push(field);
    } else {
      result.conflicts.push({ field, current: have, currentSource: source ?? "photo", voice: said });
    }
  }
  return result;
}
