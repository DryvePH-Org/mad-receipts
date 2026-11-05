import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Soft pills: a light tint with dark text and no border. The meaning is the same everywhere:
// amber = waiting or needs attention, emerald = done, red = error or overdue, grey = inactive.
export const TONES = {
  grey: "bg-muted text-muted-foreground",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  red: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-500/15 dark:text-zinc-300",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300",
  teal: "bg-teal-100 text-teal-800 dark:bg-teal-500/15 dark:text-teal-300",
  purple: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
} as const;

export type Tone = keyof typeof TONES;

export function Pill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <Badge variant="ghost" className={cn("border-transparent hover:bg-transparent", TONES[tone], className)}>
      {children}
    </Badge>
  );
}

import { STATUS_LABELS, type DealStatusKey } from "@/lib/deal/status";

const DEAL_TONE: Record<DealStatusKey, Tone> = { overdue: "red", soon: "amber", open: "blue", lender: "teal", settled: "emerald", cancelled: "zinc" };

/** Open, Due soon, Overdue, Waiting for lender, Settled or Cancelled. */
export function DealStatusBadge({ status }: { status: DealStatusKey }) {
  return <Pill tone={DEAL_TONE[status]}>{STATUS_LABELS[status]}</Pill>;
}

const RECEIPT_TONE: Record<string, [Tone, string]> = {
  pending: ["purple", "Waiting approval"], approved: ["emerald", "Approved"], rejected: ["red", "Rejected"], void: ["zinc", "Voided"],
};
export function ReceiptStatusBadge({ status }: { status: string }) {
  const [tone, label] = RECEIPT_TONE[status] ?? (["grey", status] as [Tone, string]);
  return <Pill tone={tone} className={status === "void" ? "line-through" : undefined}>{label}</Pill>;
}

const SYNC_TONE: Record<string, [Tone, string]> = {
  pending: ["amber", "Waiting"],
  failed: ["red", "Failed"],
  done: ["emerald", "Done"],
};

export function SyncStatusBadge({ status }: { status: string }) {
  const [tone, label] = SYNC_TONE[status] ?? (["grey", status] as [Tone, string]);
  return <Pill tone={tone}>{label}</Pill>;
}
