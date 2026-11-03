import { Badge } from "@/components/ui/badge";
import { dealStatusLabel } from "@/lib/deals";
import { cn } from "@/lib/utils";

// Soft pills: a light tint with dark text and no border. The meaning is the same everywhere:
// amber = waiting or needs attention, emerald = done, red = error or overdue, grey = inactive.
export const TONES = {
  grey: "bg-muted text-muted-foreground",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  red: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-500/15 dark:text-zinc-300",
} as const;

export type Tone = keyof typeof TONES;

export function Pill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <Badge variant="ghost" className={cn("border-transparent hover:bg-transparent", TONES[tone], className)}>
      {children}
    </Badge>
  );
}

const DEAL_TONE: Record<string, Tone> = { open: "amber", completed: "emerald", cancelled: "zinc" };

/** Reserved / Sold / Cancelled, as in section 2.3 of the plan. */
export function DealStatusBadge({ status }: { status: string | null | undefined }) {
  return <Pill tone={DEAL_TONE[status ?? ""] ?? "grey"}>{dealStatusLabel(status)}</Pill>;
}

export function ReceiptStatusBadge({ status }: { status: string | null | undefined }) {
  return status === "voided" ? <Pill tone="zinc">Voided</Pill> : null;
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
