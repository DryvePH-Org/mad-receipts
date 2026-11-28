import { bankTabInfo, salesTabInfo } from "./parse";

// Which tabs of the payments sheet to copy, and when. Pure.
const FRESH_MS = 15 * 60_000, OLD_MS = 24 * 3_600_000;

export interface Wanted { tab: string; kind: "bank" | "sales"; month: string | null }

export function wantedTabs(names: string[]): Wanted[] {
  return names.flatMap((tab): Wanted[] => {
    const b = bankTabInfo(tab); if (b) return [{ tab, kind: "bank", month: b.month }];
    const s = salesTabInfo(tab); return s ? [{ tab, kind: "sales", month: s.month }] : [];
  });
}

/** Which tabs to copy now: never copied first, then the ones whose copy is too old (the last two months after 15 minutes, the others after a day). */
export function dueTabs(wanted: Wanted[], state: Map<string, { synced_at: string | null }>, today: string, now: number, force = false): Wanted[] {
  const recent = (m: string | null) => !!m && m >= `${new Date(Date.parse(`${today}T00:00:00Z`) - 45 * 86_400_000).toISOString().slice(0, 7)}`;
  const age = (t: Wanted) => { const s = state.get(t.tab)?.synced_at; return s ? now - Date.parse(s) : Infinity; };
  return wanted.filter((t) => age(t) === Infinity || age(t) > (recent(t.month) ? (force ? 0 : FRESH_MS) : OLD_MS))
    .sort((a, b) => (age(a) === Infinity ? 0 : 1) - (age(b) === Infinity ? 0 : 1) || (b.month ?? "").localeCompare(a.month ?? ""));
}

