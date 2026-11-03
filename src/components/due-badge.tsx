import { Badge } from "@/components/ui/badge";
import { daysBetween } from "@/lib/dates";

/** How close a balance due date is: Overdue, Due today, or Due in N days. */
export function DueBadge({ dueDate, today }: { dueDate: string | null; today: string }) {
  if (!dueDate) return null;
  const days = daysBetween(today, dueDate);
  if (days < 0) return <Badge variant="destructive">Overdue {-days} {days === -1 ? "day" : "days"}</Badge>;
  if (days === 0) return <Badge variant="destructive">Due today</Badge>;
  return <Badge variant="secondary">Due in {days} {days === 1 ? "day" : "days"}</Badge>;
}
