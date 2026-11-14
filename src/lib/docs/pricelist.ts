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
 * What to write: only blanks are filled, except the OR date (a later date from a renewed OR replaces the old one). What a person typed is
 * never overwritten; where the documents disagree with it, a note says so.
 */
export function planPricelist(i: PricelistInput): { changes: PricelistChange[]; notes: string[] } {
  const changes: PricelistChange[] = [], notes: string[] = [];
  const cur = i.current;

  // DOCS: C when the papers are complete; the codes people type (L:NAME, EW, K...) stay
  const docs = clean(cur.docs);
  if (i.docsComplete) { if (!docs) changes.push({ field: "docs", before: "", after: "C" }); else if (docs.toUpperCase() !== "C") notes.push(`DOCS says ${docs}, typed by staff: left as it is although the papers are complete.`); }

  // OR EXP: the registration date from the official receipt
  if (i.orValidUntil) {
    if (!cur.orExp) changes.push({ field: "or_exp", before: "", after: i.orValidUntil });
    else if (i.orValidUntil > cur.orExp) changes.push({ field: "or_exp", before: cur.orExp, after: i.orValidUntil });
    else if (i.orValidUntil < cur.orExp) notes.push(`OR EXP in the sheet (${cur.orExp}) is later than the official receipt in the folder (${i.orValidUntil}): left as it is.`);
  }

  // SPAREKEY: from the staff's answer
  if (i.spareKey) {
    const want = i.spareKey === "yes" ? SPAREKEY_YES : SPAREKEY_NO, have = clean(cur.spareKey);
    if (!have) changes.push({ field: "sparekey", before: "", after: want });
    else if (have.toUpperCase().replace(/[\s/]/g, "") !== want.replace(/[\s/]/g, "") && i.spareKey === "yes" !== /^W/i.test(have)) notes.push(`SPAREKEY says ${have} but the staff answered ${i.spareKey}: left as it is.`);
  }

  // ENCUMBRANCE: the lender from the chattel mortgage or the promissory note
  if (clean(i.lender)) {
    const want = encumbranceText(i.lender as string, i.released), have = clean(cur.encumbrance);
    if (!have) changes.push({ field: "encumbrance", before: "", after: want });
    else if (have.toUpperCase() !== want) notes.push(`ENCUMBRANCE says ${have}; the documents say ${want}. Left as it is.`);
  }
  return { changes, notes };
}
