export const PAGE_SIZE = 25;

/**
 * Makes user text safe to put inside a PostgREST filter such as `plate_no.ilike.*term*`:
 * keeps letters, digits, spaces and a few name characters, and drops everything that has
 * meaning in the filter syntax (commas, parentheses, asterisks, percent signs, dots).
 */
export function searchTerm(raw: string | undefined | null): string {
  return (raw ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} '-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/** Page number from the URL: 1 for anything missing, negative or not a number. */
export function pageNumber(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

/** Row range for a page, for supabase-js `.range(from, to)`. */
export function pageRange(page: number): [number, number] {
  return [(page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1];
}

/** First value of a search param (Next gives string | string[] | undefined). */
export function param(raw: string | string[] | undefined): string {
  return (Array.isArray(raw) ? raw[0] : raw) ?? "";
}
