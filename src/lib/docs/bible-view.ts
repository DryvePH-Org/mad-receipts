import { DOCS_FIELDS, type DocsField } from "./bible";

/** What the car page shows of the sheet plan (plain data, safe to hand to the browser). */
export interface SheetPreview {
  /** before is null when the sheet has not been read for this car yet */
  changes: { header: string; before: string | null; after: string; append: boolean }[];
  notes: string[]; note: string; frozen: boolean; row: number | null; checkedAt: string | null;
}

export function toSheetPreview(p: { changes: { field: DocsField; before: string | null; after: string; mode: "set" | "append" }[]; notes: string[]; note: string; frozen: boolean; row: number | null; checkedAt: string | null }): SheetPreview {
  return { changes: p.changes.map((c) => ({ header: DOCS_FIELDS[c.field].header, before: c.before, after: c.after, append: c.mode === "append" })), notes: p.notes, note: p.note, frozen: p.frozen, row: p.row, checkedAt: p.checkedAt };
}
