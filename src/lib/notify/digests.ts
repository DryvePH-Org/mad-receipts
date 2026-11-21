import { formatDate } from "@/lib/dates";

/** The words of the scheduled messages. Pure, so they can be tested. */

const MAX_LINES = 25; // keeps a message far under Telegram's 4096 characters

export interface DigestItem { title: string; detail: string }

export function digestText(heading: string, today: string, items: readonly DigestItem[], link: string): string | null {
  if (!items.length) return null;
  const shown = items.slice(0, MAX_LINES).map((i) => `• ${i.title}\n  ${i.detail}`);
  return [`${heading} · ${formatDate(today)}`, "", shown.join("\n\n"), items.length > MAX_LINES ? `\n…and ${items.length - MAX_LINES} more.` : "", "", link].filter((l, i) => l !== "" || i === 1).join("\n");
}

export interface WeeklyStats { receiptsSaved: number; overdueDeals: number; overdueBalance: string; carsNeedScan: number; carsHandedOff: number; reviewOpen: number }

export function weeklyText(today: string, s: WeeklyStats, link: string): string {
  return [
    `📊 Weekly summary · ${formatDate(today)}`,
    "",
    `Receipts this week: ${s.receiptsSaved}`,
    `Overdue deals: ${s.overdueDeals}${s.overdueDeals ? ` (${s.overdueBalance} to collect)` : ""}`,
    `Car documents: ${s.carsNeedScan} to scan or check, ${s.carsHandedOff} papers still with the receiver, ${s.reviewOpen} in the data check`,
    "",
    link,
  ].join("\n");
}
