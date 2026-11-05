import { z } from "zod";

// What the language model returns about a spoken receipt. Every part is optional: null means "not said".
// Numbers may arrive as text ("570000", "1,200"), so they are read leniently.
const num = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,₱\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}, z.number().nonnegative().nullable()).default(null);
const text = z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null), z.string().max(200).nullable()).default(null);
const oneOf = <T extends [string, ...string[]]>(...values: T) =>
  z.preprocess((v) => (typeof v === "string" && (values as string[]).includes(v.trim().toLowerCase()) ? v.trim().toLowerCase() : null), z.enum(values).nullable()).default(null);
const date = z.preprocess((v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null), z.string().nullable()).default(null);
const list = <T extends z.ZodType>(item: T) => z.preprocess((v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object").slice(0, 6) : []), z.array(item)).default([]);
const obj = <T extends z.ZodType>(item: T) => z.preprocess((v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null), item.nullable()).default(null);

export const VoiceExtraction = z.object({
  receipt_no: text, date, kind: oneOf("earnest", "partial", "full"),
  buyer_name: text, buyer_address: text, buyer_contact: text,
  units: list(z.object({ make_type: text, plate: text, motor: text, chassis: text, color: text })),
  price: num,
  sale: oneOf("cash", "financing"), institution: text,
  down_payment: num, down_payment_percent: num, loan_amount: num, monthly: num, years: num,
  fee_mode: oneOf("standard", "none", "percent", "amount"), fee_value: num,
  trade_in: obj(z.object({ year: text, unit: text, plate: text, mileage: text, value: num })),
  lieu: obj(z.object({ amount: num, until: date })),
  earlier_paid: num, cash_today: num,
  wallets: list(z.object({ name: text, amount: num, ref: text })),
  check: obj(z.object({ amount: num, no: text, bank: text, branch: text })),
  due_date: date, due_text: text, remarks: text,
  // For each value: the exact words from the transcript it came from ("price", "down_payment", "plate:0", "wallet:1"...).
  quotes: list(z.object({ field: text, quote: text })),
});
export type VoiceExtraction = z.infer<typeof VoiceExtraction>;

/** What the form receives: the extraction after it was checked against the words that were really said. */
export interface VoiceProposal {
  source: "voice" | "typed";
  transcript: string;
  fields: VoiceExtraction;
  /** Plain-language labels of what was thrown away because it was not in the words. */
  unsure: string[];
  /** Parts of the recording the speech model was not sure about. */
  unclear: string[];
  /** Things that were said but do not agree with each other (for example the down payment and the loan do not add up to the price). */
  conflicts: string[];
}
