import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  VOUCHER_STATUS_LABELS,
  type VoucherStatus,
} from "@/lib/pcf/voucher-status";

const STATUS_CLASSES: Record<VoucherStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  released: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  approved: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  closed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  void: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function StatusBadge({
  status,
  className,
}: {
  status: VoucherStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent", STATUS_CLASSES[status], className)}
    >
      {VOUCHER_STATUS_LABELS[status]}
    </Badge>
  );
}
