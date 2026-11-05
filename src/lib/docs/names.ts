/** Lowercase, no accents or punctuation: "DELA CRUZ, Juan P." → "dela cruz juan p". */
export function normName(name: string | null | undefined): string {
  return (name ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
}

const NOISE = new Set(["mr", "mrs", "ms", "dr", "jr", "sr", "ii", "iii", "the", "and", "of", "y", "de", "del", "la", "mga"]);
const significant = (name: string) => normName(name).split(" ").filter((w) => w.length > 1 && !NOISE.has(w));

/** Edit distance, capped: enough to forgive a letter the reader got wrong. */
function close(a: string, b: string): boolean {
  if (a === b) return true;
  // a name cut short by a bad photo: "QUEZ" for "ENRIQUEZ", "GUAJO" for "GUAJARDO"
  if (Math.min(a.length, b.length) >= 4 && (a.endsWith(b) || b.endsWith(a) || a.startsWith(b) || b.startsWith(a))) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Whether two names are the same person (or company), whatever the order ("LIM, MARIA LEONILA" and
 * "Maria Leonila Lim"), middle names and one wrong letter. Needs at least two shared words, or all of a one-word name.
 */
export function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = significant(a), y = significant(b);
  if (!x.length || !y.length) return false;
  const [small, large] = x.length <= y.length ? [x, y] : [y, x];
  const shared = small.filter((w) => large.some((v) => close(w, v))).length;
  return small.length === 1 ? shared === 1 && large.length <= 2 : shared >= Math.min(2, small.length) && shared / small.length >= 0.66;
}

const COMPANY = /\b(corp|corporation|inc|incorporated|company|co|trading|enterprises?|ent|bank|finance|financing|lending|leasing|holdings|ltd|llc|cooperative|coop|auto display)\b/;
export const looksLikeCompany = (name: string | null | undefined) => COMPANY.test(normName(name));
export const looksLikeBank = (name: string | null | undefined) => /\b(bank|financ\w*|lending|leasing|savings|credit)\b/.test(normName(name));
