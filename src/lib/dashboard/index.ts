import "server-only";
import { manilaToday } from "@/lib/dates";
import { buildBuyDashboard, type BuyDashboard } from "./buy";
import { buildSellDashboard, type SellDashboard } from "./sell";
import { BUY_SHEET_ID, listTabs, readTab, readTabs, SELL_SHEET_ID } from "./sheets";

export type { BuyDashboard, SellDashboard };

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** "NOVEMBER 2026" / "Nov2026_Sold" → month 1-12, or 0. */
const monthOf = (name: string) => MONTHS.indexOf(name.trim().slice(0, 3).toLowerCase()) + 1;

/** The monthly tabs of a year, newest month first, matched by pattern so a new month's tab is picked up by itself. */
function monthlyTabs(all: string[], year: number, pattern: RegExp): { tab: string; month: number }[] {
  return all.flatMap((tab) => {
    const m = pattern.exec(tab.trim());
    return m && Number(m[2]) === year && monthOf(m[1]) > 0 ? [{ tab, month: monthOf(m[1]) }] : [];
  }).sort((a, b) => b.month - a.month);
}

export async function getBuyDashboard(): Promise<BuyDashboard> {
  const today = manilaToday(), year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7));
  const tabs = await listTabs(BUY_SHEET_ID);
  const monthly = monthlyTabs(tabs, year, /^([A-Za-z]+)\s+(\d{4})$/);
  const current = monthly.find((t) => t.month === month);
  const [monthTabs, hold, summary] = await Promise.all([
    readTabs(BUY_SHEET_ID, monthly.map((t) => t.tab)),
    readTabs(BUY_SHEET_ID, ["HOLD"]),
    readTabs(BUY_SHEET_ID, ["BUYING SUMMARY - W TRADE IN"]),
  ]);
  const byName = new Map(monthTabs.map((t) => [t.tab, t]));
  return buildBuyDashboard({
    today, month: current ? byName.get(current.tab) ?? null : null,
    monthTabs: monthly.map((t) => byName.get(t.tab)).filter((t): t is { tab: string; rows: string[][] } => !!t).reverse(), // oldest first for the history
    holdRows: hold[0]?.rows ?? null, summaryRows: summary[0]?.rows ?? null,
  });
}

export async function getSellDashboard(): Promise<SellDashboard> {
  const today = manilaToday(), year = Number(today.slice(0, 4)), month = Number(today.slice(5, 7));
  const tabs = await listTabs(SELL_SHEET_ID);
  const sold = monthlyTabs(tabs, year, /^([A-Za-z]+)(\d{4})_Sold$/).map((t) => t.tab);
  const ledger = tabs.filter((t) => new RegExp(`^Jan-[A-Za-z]+${year}_Sold$`).test(t.trim())); // the earlier months, kept in one tab
  const entries = monthlyTabs(tabs, year, /^([A-Za-z]+)(\d{4})_Entries$/).filter((t) => t.month === month).map((t) => t.tab);
  const [soldTabs, entryTabs] = await Promise.all([readTabs(SELL_SHEET_ID, [...sold, ...ledger]), readTabs(SELL_SHEET_ID, entries)]);
  return buildSellDashboard({ today, sold: soldTabs, entries: entryTabs });
}

export { readTab };
