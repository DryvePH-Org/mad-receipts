import { daysBetween } from "@/lib/dates";

// The OR renewal flag. A car's OR expiry is one real date on its record; the renewal list is worked out from it, never typed.

/** How many days before the expiry the app starts to flag it (the owner chose 30). */
export const OR_WINDOW_DAYS = 30;

export type OrState = "overdue" | "soon" | "ok" | "unknown";
export interface OrStatus { state: OrState; /** days left (negative = days late); null when there is no date */ days: number | null }

export function orStatus(expiry: string | null | undefined, today: string, window = OR_WINDOW_DAYS): OrStatus {
  if (!expiry || !/^\d{4}-\d{2}-\d{2}/.test(expiry)) return { state: "unknown", days: null };
  const days = daysBetween(today, expiry.slice(0, 10));
  return { state: days < 0 ? "overdue" : days <= window ? "soon" : "ok", days };
}

export function orLabel(s: OrStatus): string {
  if (s.days === null) return "No OR expiry date";
  if (s.days < 0) return `OR expired ${-s.days} ${-s.days === 1 ? "day" : "days"} ago`;
  if (s.days === 0) return "OR expires today";
  return `OR expires in ${s.days} ${s.days === 1 ? "day" : "days"}`;
}

/** The days on which Documentation is told by Telegram: 30, 14, 7 and 0 days before, then every 7 days while it is late. */
export function announceToday(days: number): boolean {
  return days === 30 || days === 14 || days === 7 || days === 0 || (days < 0 && -days % 7 === 0);
}

/** `live`: a sheet people still keep up to date (the price list). `older`: a list that shows the date before a renewal or an old register (the renewal list, REMARKS): it only counts when its date is LATER than the Docs Bible's. */
export interface OrSource { name: string; date: string | null; kind?: "live" | "older" }
export interface OrFinding { kind: "fill" | "differs" | "disagree"; plate: string; value: string | null; docsValue: string | null; sources: string[]; message: string }

/**
 * One car's OR dates from the Docs Bible and the sheets, compared. A blank Docs Bible date is filled when every sheet that has a date agrees;
 * a different date is never swapped in silently: it becomes a row of the data check, with every sheet that says it.
 */
export function compareOrDates(plate: string, docs: string | null, sources: OrSource[]): OrFinding[] {
  const dated = sources.filter((s): s is { name: string; date: string; kind?: "live" | "older" } => !!s.date);
  const byDate = new Map<string, string[]>();
  for (const s of dated) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s.name]);
  if (!docs) {
    if (byDate.size === 1) { const [[date, names]] = [...byDate]; return [{ kind: "fill", plate, value: date, docsValue: null, sources: names, message: `OR expiry: Car documents had none; ${names.join(" and ")} say${names.length === 1 ? "s" : ""} ${date}.` }]; }
    if (byDate.size > 1) {
      const first = dated[0];
      return [{ kind: "disagree", plate, value: first.date, docsValue: null, sources: dated.map((d) => d.name), message: `OR expiry: Car documents has none and the sheets disagree: ${[...byDate].map(([d, n]) => `${d} (${n.join(", ")})`).join(" / ")}.` }];
    }
    return [];
  }
  const counts = (d: string, names: string[]) => d !== docs && (names.some((n) => dated.find((s) => s.name === n)?.kind !== "older") || d > docs);
  return [...byDate].filter(([d, names]) => counts(d, names)).map(([d, names]) => ({ kind: "differs" as const, plate, value: d, docsValue: docs, sources: names, message: `OR expiry: ${names.join(" and ")} say${names.length === 1 ? "s" : ""} ${d}, Car documents says ${docs}.` }));
}
