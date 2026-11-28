import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { appsScriptCall, appsScriptConfigured } from "@/lib/google/apps-script";
import { parseCsv, type DataNotes } from "./parse";

export type { DataNotes };

// The two Google Sheets the staff keep (buying, and sales / online marketing), read live. They are shared as "anyone with the
// link can view", so the app reads them as plain CSV, with no key. Results are kept for a short while so a busy page does not
// hammer Google; "Refresh now" clears that.

export const BUY_SHEET_ID = process.env.DASHBOARD_BUY_SHEET_ID || "19qUB27b_6nbGU0vrcNtC-7cojOJ_tYWxVMnUloN7u1s";
/** The real MAD CONSOLIDATED 2026 (sales, entries) and the 2026 Sales Passbook Monitoring (banks, payments): private, so they are read through the Apps Script bridge. */
export const CONSOLIDATED_SHEET_ID = "1WK3BQzn-OgAyyNZc3pko_2tBvLMtsF_xI3Pl5i3oa2Y";
/** The real 2026 MAD BUYING CONSOLIDATED: private too. The Buy tab keeps reading the old public copy until DASHBOARD_BUY_SHEET_ID is set to this id. */
export const BUYING_SHEET_ID = "13JneAqaYx_qxYR44o_cqNl-awAUZSqvymCR-82-YSqU";
// until DASHBOARD_SELL_SHEET_ID is set to the real MAD CONSOLIDATED (CONSOLIDATED_SHEET_ID, once the Apps Script bridge may open it), the Sell tab keeps reading the old public copy
export const SELL_SHEET_ID = process.env.DASHBOARD_SELL_SHEET_ID || "10k3ENWKgIi634cl91jPnqrdsNBZLEWrN4uAryyuPgwo";
export const PASSBOOK_SHEET_ID = process.env.PAYMENTS_SHEET_ID || "1KTx0HiIQFHiN0fUCk_jQL2scCtsYTSw00wpgFYuH3ho";
/**
 * A sheet that is not shared with "anyone with the link" is read through the Apps Script bridge (it runs as your Google account and only opens the spreadsheets
 * listed in its ALLOWED_SHEET_IDS). Which sheets: DASHBOARD_PRIVATE_SHEETS (comma separated ids), plus the two above once the bridge is configured.
 */
export function isPrivateSheet(id: string): boolean {
  if (!appsScriptConfigured()) return false;
  const named = (process.env.DASHBOARD_PRIVATE_SHEETS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return [CONSOLIDATED_SHEET_ID, PASSBOOK_SHEET_ID, BUYING_SHEET_ID, ...named].includes(id);
}
export const sheetUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;
export const DASHBOARD_TAG = "dashboard-sheets";

/** A problem reading a sheet, in words staff can act on. */
export class SheetError extends Error {}

const MAX_BYTES = 20 * 1024 * 1024; // a runaway answer must not fill the server's memory

/** One try, or two when Google hiccups (a network error or a 5xx). 429 and 4xx are answered straight away. */
export async function fetchText(url: string): Promise<string> {
  let last: SheetError = new SheetError("Could not reach Google Sheets. Try again in a moment.");
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try { res = await fetch(url, { signal: AbortSignal.timeout(25_000), redirect: "follow" }); } catch { continue; }
    if (res.status === 429) throw new SheetError("Google Sheets is busy right now. Try again in a minute.");
    if (res.status >= 500) { last = new SheetError(`Google Sheets answered ${res.status}. Try again in a moment.`); continue; }
    if (!res.ok) throw new SheetError(`Google Sheets answered ${res.status}. Check that the sheet is shared as "Anyone with the link can view".`);
    if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new SheetError("The sheet answered with far more data than expected, so it was not read.");
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new SheetError("The sheet answered with far more data than expected, so it was not read.");
    return text;
  }
  throw last;
}

/** The last good answer for each address, kept in this server process: if Google cannot be reached, the dashboards still show it, marked as old. */
const lastGood = new Map<string, { value: unknown; at: number }>();
export async function withFallback<T>(key: string, load: () => Promise<T>): Promise<{ value: T; at: number; stale: boolean }> {
  try {
    const value = await load();
    const at = Date.now();
    lastGood.set(key, { value, at });
    return { value, at, stale: false };
  } catch (e) {
    const old = lastGood.get(key);
    if (old) return { value: old.value as T, at: old.at, stale: true };
    throw e;
  }
}

/** The tab names of a sheet, in order. Google quietly serves the FIRST tab for a name it does not know, so names are checked first. */
export async function listTabInfo(sheetId: string): Promise<{ name: string; gid: string }[]> {
  return (await listTabInfoChecked(sheetId)).tabs;
}

export async function listTabInfoChecked(sheetId: string): Promise<{ tabs: { name: string; gid: string }[]; at: number; stale: boolean }> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 86_400 });
  cacheTag(DASHBOARD_TAG);
  const r = await withFallback(`tabs:${sheetId}`, () => loadTabInfo(sheetId));
  return { tabs: r.value, at: r.at, stale: r.stale };
}

async function loadTabInfo(sheetId: string): Promise<{ name: string; gid: string }[]> {
  if (isPrivateSheet(sheetId)) return privateTabs(sheetId);
  const html = await fetchText(`https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`);
  const tabs = [...html.matchAll(/items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)"[^}]*?gid:\s*"(\d+)"/g)].map((m) => {
    let name = m[1];
    try { name = JSON.parse(`"${m[1]}"`) as string; } catch { /* keep the raw text */ }
    return { name, gid: m[2] };
  });
  if (tabs.length === 0) throw new SheetError('Could not read the tabs of the sheet. Check that it is shared as "Anyone with the link can view".');
  return tabs;
}

/** A link that opens the sheet on one row of one tab. */
export const rowLink = (sheetId: string, gid: string | undefined, row: number) => (gid ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit#gid=${gid}&range=A${row}` : null);

/** Every cell of one tab, as the sheet shows it, with when it was read and whether it is an older copy because Google could not be reached. */
export async function readTab(sheetId: string, tab: string): Promise<{ rows: string[][]; at: number; stale: boolean }> {
  "use cache";
  cacheLife({ stale: 15, revalidate: 60, expire: 86_400 }); // an older copy is shown while a fresh one is read, so nobody waits for Google after a quiet spell
  cacheTag(DASHBOARD_TAG);
  const r = await withFallback(`tab:${sheetId}:${tab}`, async () => {
    if (isPrivateSheet(sheetId)) return privateRows(sheetId, tab);
    const text = await fetchText(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`);
    if (/^\s*<(!doctype|html)/i.test(text)) throw new SheetError(`Could not read the tab "${tab}". Check that the sheet is shared as "Anyone with the link can view".`);
    return parseCsv(text);
  });
  return { rows: r.value, at: r.at, stale: r.stale };
}

/**
 * Reads the tabs that exist, skipping the ones that do not (a month that has no tab yet). One tab failing never stops the others,
 * but it is reported in `notes`, so a missing number is never mistaken for a zero.
 */
export async function readTabs(sheetId: string, wanted: string[]): Promise<{ tabs: { tab: string; rows: string[][] }[]; notes: DataNotes }> {
  const list = await listTabInfoChecked(sheetId);
  const have = new Set(list.tabs.map((t) => t.name.toLowerCase()));
  const present = wanted.filter((t) => have.has(t.toLowerCase()));
  const results = await Promise.all(present.map(async (tab) => ({ tab, r: await readTab(sheetId, tab).catch(() => null) })));
  const old = [list.stale ? list.at : null, ...results.map((x) => (x.r?.stale ? x.r.at : null))].filter((n): n is number => n !== null);
  return {
    tabs: results.flatMap((x) => (x.r ? [{ tab: x.tab, rows: x.r.rows }] : [])),
    notes: { failed: results.filter((x) => !x.r).map((x) => x.tab), staleSince: old.length ? new Date(Math.min(...old)).toISOString() : null },
  };
}

export function mergeNotes(...all: DataNotes[]): DataNotes {
  const since = all.map((n) => n.staleSince).filter((x): x is string => !!x).sort();
  return { failed: all.flatMap((n) => n.failed), staleSince: since[0] ?? null };
}

/** The tabs of a private sheet, through the bridge. */
export async function privateTabs(sheetId: string): Promise<{ name: string; gid: string }[]> {
  try { return await appsScriptCall<{ name: string; gid: string }[]>("sheets.tabs", { spreadsheetId: sheetId }); }
  catch (e) { throw new SheetError(`Could not read the tabs through the Google Apps Script bridge: ${e instanceof Error ? e.message : "unknown"}. Is the sheet in its ALLOWED_SHEET_IDS, and does the script's Google account have access to it?`); }
}

/** Every cell of one tab of a private sheet, as the sheet shows it (rows are cut after their last filled cell). */
export async function privateRows(sheetId: string, tab: string): Promise<string[][]> {
  try { return await appsScriptCall<string[][]>("sheets.get", { spreadsheetId: sheetId, range: `'${tab.replace(/'/g, "''")}'` }); }
  catch (e) { throw new SheetError(`Could not read the tab "${tab}" through the Google Apps Script bridge: ${e instanceof Error ? e.message : "unknown"}.`); }
}
