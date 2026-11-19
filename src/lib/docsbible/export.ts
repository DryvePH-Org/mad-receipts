// The Docs Bible as a CSV in the layout of the old Google Sheet: the same columns in the same places (A to AP), then two new ones (AQ, AR), the same header words.
// It can be opened or imported in Google Sheets or Excel as it is. Pure.
import { COLUMNS } from "./grid";

const LAST = 44; // A..AR (AQ and AR are new in MAD: papers with, registry of deeds)
const letterToIndex = (l: string): number => [...l].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** Row 1 of the sheet: the header words at their letters, blank where the sheet had no header (A, B, V). */
export function exportHeader(): string[] {
  const row = Array<string>(LAST).fill("");
  for (const c of COLUMNS) row[letterToIndex(c.letter)] = c.label;
  return row;
}

/** One car as a sheet row. Column A is a copy of the plate (as in the sheet). Dates are YYYY-MM-DD. */
export function exportRow(values: Record<string, string | null>, complete: string | null): string[] {
  const row = Array<string>(LAST).fill("");
  for (const c of COLUMNS) row[letterToIndex(c.letter)] = c.key === "complete_docs" ? complete ?? "" : values[c.key] ?? "";
  row[0] = values.plate_display ?? "";
  return row;
}

const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** CSV with a byte order mark so Excel reads the accents and peso signs right. */
export const toCsv = (rows: string[][]): string => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

export const backupName = (manilaDate: string) => `docs-bible-${manilaDate}.csv`;
