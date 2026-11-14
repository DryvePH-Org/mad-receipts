// Which columns the app and the bots rely on, by the header text the sheet must show. Used by the go-live check, so a sheet that was
// changed (a renamed or moved column) is caught before anyone relies on it.

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export const INVENTORY_HEADERS = ["PLATE NUMBER", "YM", "BRAND", "MAKE", "COLOR", "PRICE", "DATE ARRIVED", "REMARKS", "REPAIR STATUS"];
export const PRICELIST_WRITE_HEADERS = ["DOCS", "OR EXP", "SPAREKEY", "ENCUMBRANCE", "PLATE NUMBER"];
export const DOCS_BIBLE_HEADERS = ["PLATE NO.", "DATE ARRIVAL", "CLASSIFICATION", "CR", "OR", "DEED OF SALE", "SELLER'S ID", "SEC CERT", "SEC ID'S", "BOARDS RESO", "Encumbered", "CHATTEL", "PROMISSORY", "REMARKS I", "COMPLETE DOCS?"];
export const CHANGELOG_HEADERS = ["When", "Plate", "Tab", "Cell", "Field", "Before", "After", "Reason"];

/** The header row (searched in the first `searchRows` rows) that holds the most of the wanted headers, and which of them are missing from it. */
export function findHeaders(rows: string[][], wanted: string[], searchRows = 6): { rowIndex: number; missing: string[]; found: number } {
  let best = { rowIndex: -1, missing: wanted, found: 0 };
  rows.slice(0, searchRows).forEach((r, i) => {
    const have = new Set(r.map(key));
    const missing = wanted.filter((w) => !have.has(key(w)));
    if (wanted.length - missing.length > best.found) best = { rowIndex: i, missing, found: wanted.length - missing.length };
  });
  return best;
}

/** How many of the first `limit` cells in a column show a Google error (#REF!, #N/A...), the sign of a lost import. */
export const errorCells = (rows: string[][], limit = 60): number => rows.slice(0, limit).reduce((n, r) => n + r.filter((c) => /^#(REF|N\/A|ERROR|VALUE|NAME)[!?]?$/.test(c.trim())).length, 0);
