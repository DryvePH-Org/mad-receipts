import "server-only";
import { parseCsv } from "@/lib/dashboard/parse";
import { fetchText, listTabInfo } from "@/lib/dashboard/sheets";
import { parseSheetDate } from "@/lib/cars/model";
import { normalizePlate } from "@/lib/rules/plate";
import { DOCS_FIELDS, type DocsField } from "./bible";
import { findHeaders } from "@/lib/golive/headers";
import { DOCS_BIBLE_HEADERS } from "@/lib/golive/headers";

// Reading a unit's row in the Docs Bible DIRECTLY, as plain CSV (the workbook is shared "Anyone with the link can view"): exact, in about a
// second, and with no bot job. Only reading: every write still goes through the sheet editor bot, which checks each cell again before it
// writes, so a reading a few seconds old can never cause a wrong write.

export interface FastBibleRow { found: boolean; matches: number; row: number | null; arrival: string; values: Partial<Record<DocsField, string>> }

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const memo = new Map<string, { at: number; rows: string[][] }>();
const MEMO_MS = 20_000; // a check and a send a moment apart share one download

async function tabRows(sheetId: string, tab: string, now: number): Promise<string[][]> {
  const k = `${sheetId}:${tab}`, hit = memo.get(k);
  if (hit && now - hit.at < MEMO_MS) return hit.rows;
  const gid = process.env.DOCS_BIBLE_DOCS_GID?.trim() || (await listTabInfo(sheetId)).find((t) => t.name.trim().toUpperCase() === tab.trim().toUpperCase())?.gid;
  if (!gid) throw new Error(`The tab "${tab}" was not found in the workbook.`);
  const text = await fetchText(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`);
  if (/^\s*<(!doctype|html)/i.test(text)) throw new Error("The workbook is not readable by link.");
  const rows = parseCsv(text);
  memo.set(k, { at: now, rows });
  return rows;
}

/** The unit's current row (the latest DATE ARRIVAL when a plate appears more than once), read from the exported tab. Throws when the tab cannot be read or its headers are not as expected. */
export async function readBibleRowFast(plate: string, sheetId: string, tab: string, now = Date.now()): Promise<FastBibleRow> {
  const rows = await tabRows(sheetId, tab, now);
  const h = findHeaders(rows, DOCS_BIBLE_HEADERS, 4);
  if (h.rowIndex < 0 || h.missing.length) throw new Error(`Columns missing in "${tab}": ${h.missing.join(", ") || "all"}.`);
  const header = rows[h.rowIndex].map(key);
  const col = (name: string) => header.indexOf(key(name));
  const iPlate = col("PLATE NO."), iArr = col("DATE ARRIVAL");
  const want = normalizePlate(plate);
  const hits = rows.slice(h.rowIndex + 1).map((r, i) => ({ r, n: h.rowIndex + 2 + i })).filter(({ r }) => normalizePlate(r[iPlate]) === want);
  if (!hits.length) return { found: false, matches: 0, row: null, arrival: "", values: {} };
  const dated = hits.map((x) => ({ ...x, d: parseSheetDate(x.r[iArr]) ?? "" })).sort((a, b) => b.d.localeCompare(a.d));
  if (dated.length > 1 && dated[0].d && dated[0].d === dated[1].d) throw new Error("Two rows with this plate arrived on the same day.");
  const cur = dated[0];
  const values: Partial<Record<DocsField, string>> = {};
  for (const f of Object.keys(DOCS_FIELDS) as DocsField[]) { const i = col(DOCS_FIELDS[f].header); values[f] = i >= 0 ? (cur.r[i] ?? "").trim() : ""; }
  return { found: true, matches: hits.length, row: cur.n, arrival: cur.d, values };
}
