/** The sheets the receipt can be printed on. A receipt is half of a sheet; two make one sheet. Philippine offices often use "bond paper", not A4. */
export type PaperKey = "a4" | "letter" | "legal" | "folio";

export const PAPERS: Record<PaperKey, { name: string; w: number; h: number }> = {
  a4: { name: "A4 · 210 × 297 mm", w: 210, h: 297 },
  letter: { name: "Short bond (Letter) · 8.5 × 11 in", w: 215.9, h: 279.4 },
  folio: { name: "Long bond (Folio) · 8.5 × 13 in", w: 215.9, h: 330.2 },
  legal: { name: "Legal · 8.5 × 14 in", w: 215.9, h: 355.6 },
};

export const isPaper = (v: unknown): v is PaperKey => typeof v === "string" && v in PAPERS;

/** Millimetres to the pixels a screen shows them at. */
export const MM = 96 / 25.4;

/** Size of one receipt (half a sheet) in millimetres. */
export const halfOf = (key: PaperKey) => ({ w: PAPERS[key].w, h: Math.round((PAPERS[key].h / 2) * 10) / 10 });
