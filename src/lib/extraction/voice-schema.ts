import { z } from "zod";
import type { NameMatch } from "@/lib/salespeople/names";
import { ExtractedReceipt } from "./schema";
import { TermsSuggestion } from "./terms-schema";

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** A commission percent from 0 to 100, as a number ("3", "3%", 2.5). Anything else is null. */
export function parsePercent(value: unknown): number | null {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim().replace(/%$/, "").trim() : "";
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  return n >= 0 && n <= 100 ? n : null;
}

/** One salesperson as heard: the name said, and their own commission percent if one was said. */
const HeardPerson = z.preprocess(
  // A percent the model left out entirely means "not said", the same as null.
  (v) => (isObject(v) ? { name: v.name ?? "", commission_percent: v.commission_percent ?? null } : v),
  z.object({
    name: z.unknown().transform((v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 60) : "")),
    commission_percent: z.unknown().transform(parsePercent),
  }),
);

/** What the language model returns for a transcript: receipt fields plus who sold the car. */
export const VoiceExtraction = z.preprocess(
  (v) =>
    isObject(v)
      ? {
          fields: isObject(v.fields) ? v.fields : {},
          terms: isObject(v.terms) ? v.terms : {},
          salespeople: Array.isArray(v.salespeople) ? v.salespeople : [],
        }
      : v,
  z.object({
    fields: ExtractedReceipt,
    terms: TermsSuggestion,
    // Entries without a name are dropped instead of failing the whole note.
    salespeople: z.array(z.unknown()).transform((items) =>
      items.flatMap((item) => {
        const parsed = HeardPerson.safeParse(item);
        return parsed.success && parsed.data.name ? [parsed.data] : [];
      }),
    ),
  }),
);

export type VoiceExtraction = z.output<typeof VoiceExtraction>;

/** A salesperson heard in the note, matched to the salespeople list. */
export interface HeardSalesperson extends NameMatch {
  /** The percent said for this person, or null if none was said. */
  commission_percent: number | null;
}

/** The saved result of a voice note (or typed note) on a draft. The audio is never kept. */
export interface VoiceResult {
  source: "voice" | "typed";
  transcript: string;
  fields: ExtractedReceipt;
  /** How the sale is paid, as said. Missing on notes saved before this existed. */
  terms?: TermsSuggestion;
  salespeople: HeardSalesperson[];
  /** What was said but could not be checked against the words, so it was left blank (e.g. "the plate number"). */
  unsure?: string[];
  /** Parts of the recording the speech model was not sure about; they were ignored. */
  unclear?: string[];
  transcribed_at: string;
}
