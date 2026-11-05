import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { parseCsv } from "./parse";

// The two Google Sheets the staff keep (buying, and sales / online marketing), read live. They are shared as "anyone with the
// link can view", so the app reads them as plain CSV, with no key. Results are kept for a short while so a busy page does not
// hammer Google; "Refresh now" clears that.

export const BUY_SHEET_ID = process.env.DASHBOARD_BUY_SHEET_ID || "19qUB27b_6nbGU0vrcNtC-7cojOJ_tYWxVMnUloN7u1s";
export const SELL_SHEET_ID = process.env.DASHBOARD_SELL_SHEET_ID || "10k3ENWKgIi634cl91jPnqrdsNBZLEWrN4uAryyuPgwo";
export const sheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;
export const DASHBOARD_TAG = "dashboard-sheets";

/** A problem reading a sheet, in words staff can act on. */
export class SheetError extends Error {}

async function fetchText(url: string): Promise<string> {
  let res: Response;
  try { res = await fetch(url, { signal: AbortSignal.timeout(25_000), redirect: "follow" }); } catch { throw new SheetError("Could not reach Google Sheets. Try again in a moment."); }
  if (res.status === 429) throw new SheetError("Google Sheets is busy right now. Try again in a minute.");
  if (!res.ok) throw new SheetError(`Google Sheets answered ${res.status}. Check that the sheet is shared as "Anyone with the link can view".`);
  return res.text();
}

/** The tab names of a sheet, in order. Google quietly serves the FIRST tab for a name it does not know, so names are checked first. */
export async function listTabs(sheetId: string): Promise<string[]> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  cacheTag(DASHBOARD_TAG);
  const html = await fetchText(`https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`);
  const names = [...html.matchAll(/items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => { try { return JSON.parse(`"${m[1]}"`) as string; } catch { return m[1]; } });
  if (names.length === 0) throw new SheetError('Could not read the tabs of the sheet. Check that it is shared as "Anyone with the link can view".');
  return names;
}

/** Every cell of one tab, as the sheet shows it. */
export async function readTab(sheetId: string, tab: string): Promise<string[][]> {
  "use cache";
  cacheLife({ stale: 15, revalidate: 30, expire: 600 });
  cacheTag(DASHBOARD_TAG);
  const text = await fetchText(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`);
  if (/^\s*<(!doctype|html)/i.test(text)) throw new SheetError(`Could not read the tab "${tab}". Check that the sheet is shared as "Anyone with the link can view".`);
  return parseCsv(text);
}

/** Reads the tabs that exist, skipping the ones that do not (a month that has no tab yet). One tab failing never stops the others. */
export async function readTabs(sheetId: string, wanted: string[]): Promise<{ tab: string; rows: string[][] }[]> {
  const have = new Set((await listTabs(sheetId)).map((t) => t.toLowerCase()));
  const present = wanted.filter((t) => have.has(t.toLowerCase()));
  const out = await Promise.all(present.map(async (tab) => ({ tab, rows: await readTab(sheetId, tab).catch(() => null) })));
  return out.filter((x): x is { tab: string; rows: string[][] } => x.rows !== null);
}
