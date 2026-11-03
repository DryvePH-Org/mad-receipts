// Dates are plain "YYYY-MM-DD" strings (what the database stores in date columns). "Today" is
// always Manila's today, whatever the server's timezone is.

/** Today in Manila as YYYY-MM-DD. */
export function manilaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila" }).format(now);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const toUtc = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** "2026-11-03" plus 3 days is "2026-11-06". */
export function addDays(date: string, days: number): string {
  return new Date(toUtc(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from a to b (b minus a); negative when b is earlier. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** First day of the month containing the date: "2026-11-17" gives "2026-11-01". */
export const monthStart = (date: string) => `${date.slice(0, 7)}-01`;

/** "2026-11-05" → "Nov 5, 2026". */
export function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** An ISO timestamp in Manila time, e.g. "Nov 3, 2026, 1:27 PM". */
export function formatManilaDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}
