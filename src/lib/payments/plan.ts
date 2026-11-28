import { bankTabInfo, salesTabInfo } from "./parse";

// Which tabs of the payments sheet to copy, and when. Pure.
const DAY_MS = 20 * 3_600_000; // "daily": a little under 24 h, so the run at the same hour tomorrow always counts

export interface Wanted { tab: string; kind: "bank" | "sales"; month: string | null }

export function wantedTabs(names: string[]): Wanted[] {
  return names.flatMap((tab): Wanted[] => {
    const b = bankTabInfo(tab); if (b) return [{ tab, kind: "bank", month: b.month }];
    const s = salesTabInfo(tab); return s ? [{ tab, kind: "sales", month: s.month }] : [];
  });
}

/**
 * Which tabs to copy now. A tab never copied comes first (the first fill of the year). After that only the CURRENT month is copied again, once a day;
 * the older months stay as they were. A manual refresh (force) copies every tab.
 */
export function dueTabs(wanted: Wanted[], state: Map<string, { synced_at: string | null }>, today: string, now: number, force = false): Wanted[] {
  const age = (t: Wanted) => { const s = state.get(t.tab)?.synced_at; return s ? now - Date.parse(s) : Infinity; };
  const current = (t: Wanted) => t.month === today.slice(0, 7);
  return wanted.filter((t) => force || age(t) === Infinity || (current(t) && age(t) > DAY_MS))
    .sort((a, b) => (age(a) === Infinity ? 0 : 1) - (age(b) === Infinity ? 0 : 1) || (b.month ?? "").localeCompare(a.month ?? ""));
}
