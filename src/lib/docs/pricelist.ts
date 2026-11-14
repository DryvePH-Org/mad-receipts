// What the car documents say about the MAD Pricelist's INVENTORY 2026 tab. Four cells at most: DOCS, OR EXP, SPAREKEY, ENCUMBRANCE.
// Pure rules (no network): the sheet editor bot does the writing. See Docs/sheets-study.md.

export const PRICELIST_FIELDS = {
  docs: { header: "DOCS", kind: "text" },
  or_exp: { header: "OR EXP", kind: "date" },
  sparekey: { header: "SPAREKEY", kind: "text" },
  encumbrance: { header: "ENCUMBRANCE", kind: "text" },
} as const;
export type PricelistField = keyof typeof PRICELIST_FIELDS;

export interface PricelistChange { field: PricelistField; before: string; after: string }
export interface PricelistInput {
  /** every paper the case needs before the sale is in the folder and nothing is flagged */
  docsComplete: boolean;
  /** the latest valid-until date read from an official receipt (YYYY-MM-DD) */
  orValidUntil: string | null;
  spareKey: "yes" | "no" | "";
  lender: string | null;
  /** a cancellation or release of the chattel mortgage is on file */
  released: boolean;
  /** what the sheet shows now (the date as YYYY-MM-DD, or null when blank) */
  current: { docs: string; orExp: string | null; spareKey: string; encumbrance: string };
}

const clean = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
export const SPAREKEY_YES = "W/SPAREKEY";
export const SPAREKEY_NO = "N/A";

/** "EASTWEST BANK" + released → "EASTWEST BANK - RELEASED", the way the sheet already reads. */
export const encumbranceText = (lender: string, released: boolean): string => `${clean(lender).toUpperCase()}${released ? " - RELEASED" : ""}`.slice(0, 80);

/**
 * What to write: the app always wins. Each of the four cells is set to what the documents and the staff say, whatever the sheet held; the bot
 * still checks the cell is unchanged since we read it, and every change is logged.
 */
export function planPricelist(i: PricelistInput): { changes: PricelistChange[]; notes: string[] } {
  const changes: PricelistChange[] = [], notes: string[] = [];
  const cur = i.current;
  const set = (field: PricelistChange["field"], have: string | null | undefined, want: string) => { if ((have ?? "").trim() !== want) changes.push({ field, before: (have ?? "").trim(), after: want }); };

  if (i.docsComplete) set("docs", clean(cur.docs), "C"); // C when the papers are complete
  if (i.orValidUntil) set("or_exp", cur.orExp, i.orValidUntil); // the registration date from the official receipt
  if (i.spareKey) {
    const want = i.spareKey === "yes" ? SPAREKEY_YES : SPAREKEY_NO, have = clean(cur.spareKey);
    if (have.toUpperCase().replace(/[\s/]/g, "") !== want.replace(/[\s/]/g, "")) set("sparekey", have, want);
  }
  if (clean(i.lender)) set("encumbrance", clean(cur.encumbrance), encumbranceText(i.lender as string, i.released));
  return { changes, notes };
}
