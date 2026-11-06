import { Badge } from "@/components/ui/badge";
import {
  REPLENISHMENT_STATUS_LABELS,
  type ReplenishmentStatus,
} from "@/lib/pcf/replenishment-status";
import { cn } from "@/lib/utils";

const STATUS_CLASSES: Record<ReplenishmentStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  approved: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  closed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
};

export function ReplenishmentStatusBadge({
  status,
  className,
}: {
  status: ReplenishmentStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent", STATUS_CLASSES[status], className)}
    >
      {REPLENISHMENT_STATUS_LABELS[status]}
    </Badge>
  );
}
