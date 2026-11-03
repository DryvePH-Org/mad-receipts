import { daysBetween, formatDate } from "@/lib/dates";
import { pesos } from "@/lib/deals";

export interface DueDeal {
  plate_no: string;
  buyer_name: string;
  balance: number;
  /** YYYY-MM-DD */
  due_date: string;
}

const MAX_LINES = 40; // keeps the message under Telegram's 4096 character limit

const line = (d: DueDeal, today: string) => {
  const late = daysBetween(d.due_date, today);
  const when = late > 0 ? `due ${formatDate(d.due_date)} (${late} ${late === 1 ? "day" : "days"} late)` : "due today";
  return `• ${d.plate_no} · ${d.buyer_name} · ${pesos(d.balance)} · ${when}`;
};

/**
 * The daily balance reminder: deals whose balance is due today or already late, most overdue
 * first. Returns null when nothing is due (no message is sent).
 */
export function buildReminderMessage(deals: DueDeal[], today: string): string | null {
  const due = deals.filter((d) => d.due_date <= today).sort((a, b) => a.due_date.localeCompare(b.due_date));
  if (due.length === 0) return null;

  const overdue = due.filter((d) => d.due_date < today);
  const dueToday = due.filter((d) => d.due_date === today);
  const shown = new Set([...overdue, ...dueToday].slice(0, MAX_LINES));

  const section = (title: string, list: DueDeal[]) => {
    const rows = list.filter((d) => shown.has(d)).map((d) => line(d, today));
    return rows.length ? `${title}\n${rows.join("\n")}` : "";
  };
  const hidden = due.length - shown.size;

  return [
    `⏰ Balance reminders · ${formatDate(today)}`,
    section("Overdue:", overdue),
    section("Due today:", dueToday),
    hidden > 0 ? `…and ${hidden} more. Open the app to see them all.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
