import "server-only";
import { manilaToday } from "@/lib/dates";
import type { AppSettings } from "@/lib/deal/settings";
import { buildBuyDashboard, type BuyDashboard } from "./buy";
import { buildSellDashboard, type SellDashboard } from "./sell";
import { BUY_SHEET_ID, listTabInfo, mergeNotes, readTabs, rowLink, SELL_SHEET_ID } from "./sheets";

export type { BuyDashboard, SellDashboard };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** "NOVEMBER 2026" / "Nov2026_Sold" → month 1-12, or 0. */
const monthOf = (name: string) => MONTHS.indexOf(name.trim().slice(0, 3).toLowerCase()) + 1;

/** The years whose tabs are read: this one, and last year's too in the first months, when a December reservation may still be open. */
const yearsToRead = (today: string): number[] => {
  const year = Number(today.slice(0, 4));
  return Number(today.slice(5, 7)) <= 3 ? [year - 1, year] : [year];
};

/** The monthly tabs of those years, newest month first, matched by pattern so a new month's tab is picked up by itself. */
function monthlyTabs(all: string[], years: number[], pattern: RegExp): { tab: string; month: number; year: number }[] {
  return all.flatMap((tab) => {
    const m = pattern.exec(tab.trim());
    return m && years.includes(Number(m[2])) && monthOf(m[1]) > 0 ? [{ tab, month: monthOf(m[1]), year: Number(m[2]) }] : [];
  }).sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month));
}

export async function getBuyDashboard(goals: AppSettings["dashboard"]): Promise<BuyDashboard> {
  const today = manilaToday(), year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7));
  const info = await listTabInfo(BUY_SHEET_ID);
  const gid = new Map(info.map((t) => [t.name, t.gid]));
  const linkOf = (tab: string) => (row: number) => rowLink(BUY_SHEET_ID, gid.get(tab), row);
  const monthly = monthlyTabs(info.map((t) => t.name), yearsToRead(today), /^([A-Za-z]+)\s+(\d{4})$/);
  const current = monthly.find((t) => t.month === month && t.year === year);
  const [monthTabs, hold, summary] = await Promise.all([
    readTabs(BUY_SHEET_ID, monthly.map((t) => t.tab)),
    readTabs(BUY_SHEET_ID, ["HOLD"]),
    readTabs(BUY_SHEET_ID, ["BUYING SUMMARY - W TRADE IN"]),
  ]);
  const byName = new Map(monthTabs.tabs.map((t) => [t.tab, { ...t, linkOf: linkOf(t.tab) }]));
  const built = buildBuyDashboard({
    today, month: current ? byName.get(current.tab) ?? null : null,
    monthTabs: monthly.map((t) => byName.get(t.tab)).filter((t): t is NonNullable<typeof t> => !!t).reverse(), // oldest first for the history
    holdRows: hold.tabs[0]?.rows ?? null, holdLinkOf: linkOf("HOLD"), summaryRows: summary.tabs[0]?.rows ?? null, goals,
  });
  return { ...built, notes: mergeNotes(monthTabs.notes, hold.notes, summary.notes) };
}

export async function getSellDashboard(goals: AppSettings["dashboard"]): Promise<SellDashboard> {
  const today = manilaToday(), year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7));
  const years = yearsToRead(today);
  const info = await listTabInfo(SELL_SHEET_ID);
  const tabs = info.map((t) => t.name);
  const gid = new Map(info.map((t) => [t.name, t.gid]));
  const monthly = monthlyTabs(tabs, years, /^([A-Za-z]+)(\d{4})_Sold$/);
  // The earlier months of a year are also kept in one tab ("Jan-Sept2026_Sold").
  const ledger = tabs.flatMap((t) => { const m = /^Jan-[A-Za-z]+(\d{4})_Sold$/.exec(t.trim()); return m && years.includes(Number(m[1])) ? [{ tab: t, year: Number(m[1]) }] : []; });
  const entries = monthlyTabs(tabs, [year], /^([A-Za-z]+)(\d{4})_Entries$/).filter((t) => t.month === month).map((t) => t.tab);
  // newer tabs rank higher: a year's ledger sits just below that year's January
  const orderOf = new Map([...monthly.map((t) => [t.tab, t.year * 100 + t.month] as const), ...ledger.map((t) => [t.tab, t.year * 100] as const)]);
  const [soldTabs, entryTabs] = await Promise.all([readTabs(SELL_SHEET_ID, [...monthly.map((t) => t.tab), ...ledger.map((t) => t.tab)]), readTabs(SELL_SHEET_ID, entries)]);
  const built = buildSellDashboard({ today, sold: soldTabs.tabs.map((t) => ({ ...t, order: orderOf.get(t.tab) ?? 0, linkOf: (row: number) => rowLink(SELL_SHEET_ID, gid.get(t.tab), row) })), entries: entryTabs.tabs, goals });
  return { ...built, notes: mergeNotes(soldTabs.notes, entryTabs.notes) };
}
