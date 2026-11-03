import { Pill } from "@/components/shared/status-badge";
import { daysBetween } from "@/lib/dates";

/** How close a balance due date is: Overdue (red), Due today (amber), or Due in N days. */
export function DueBadge({ dueDate, today }: { dueDate: string | null; today: string }) {
  if (!dueDate) return null;
  const days = daysBetween(today, dueDate);
  if (days < 0) return <Pill tone="red">Overdue {-days} {days === -1 ? "day" : "days"}</Pill>;
  if (days === 0) return <Pill tone="amber">Due today</Pill>;
  return <Pill tone="grey">Due in {days} {days === 1 ? "day" : "days"}</Pill>;
}
