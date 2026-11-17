// The cut-over check: has anybody typed in the OLD Google Sheet since the data was moved to the database? Each moved row keeps the cells
// it had in the sheet at the time of the move (`raw`). This compares those cells with the sheet as it is now, for the columns people type
// (classification, the papers, the status, the notes), and finds rows added to the sheet since. Pure: the caller reads the sheet and the table.

const norm = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
const headerKey = (s: string) => s.replace(/\s+/g, " ").trim().toUpperCase();
const letter = (n: number): string => { let s = ""; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

/** The columns people type. (Dates and numbers are left out: a sheet shows them differently from the file the move was made from.) */
export const WATCHED = ["CLASSIFICATION", "CR", "OR", "DEED OF SALE", "SELLER'S ID", "SEC CERT", "SEC ID'S", "BOARDS RESO", "ENCUMBERED", "CHATTEL", "PROMISSORY", "STENCIL", "VEHICLE STATUS", "OTHER DOCS ATTACHED", "PAPER STATUS", "REMARKS I", "REMARKS II"];

export interface MovedRow { plate: string; sourceRow: number; raw: Record<string, string> }
export interface SheetChange { plate: string; row: number; column: string; was: string; now: string }
export interface CutoverReport { changed: SheetChange[]; carsChanged: number; newPlates: string[]; checkedRows: number }

export function sheetChangesSinceMove(rows: string[][], moved: readonly MovedRow[], isPlate: (v: string) => string): CutoverReport {
  const header = rows[0] ?? [];
  const cols = header.map((h, i) => ({ key: headerKey(h ?? ""), i })).filter((c) => WATCHED.includes(c.key));
  const plateCol = header.findIndex((h) => headerKey(h ?? "") === "PLATE NO.");
  const changed: SheetChange[] = [];
  for (const m of moved) {
    const row = rows[m.sourceRow - 1];
    if (!row) continue;
    for (const c of cols) {
      const was = norm(m.raw[`${letter(c.i + 1)} ${c.key}`]);
      const now = norm(row[c.i]);
      if (/^#(REF|N\/A|VALUE|NAME|DIV\/0|ERROR)/i.test(now)) continue; // an error cell is not an edit
      if (was !== now) changed.push({ plate: m.plate, row: m.sourceRow, column: c.key, was, now });
    }
  }
  const known = new Set(moved.map((m) => m.plate));
  const newPlates: string[] = [];
  if (plateCol >= 0) for (const r of rows.slice(1)) { const p = isPlate(r[plateCol] ?? ""); if (p && !known.has(p) && !newPlates.includes(p)) newPlates.push(p); }
  return { changed, carsChanged: new Set(changed.map((c) => c.plate)).size, newPlates, checkedRows: moved.length };
}
