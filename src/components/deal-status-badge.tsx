import { Badge } from "@/components/ui/badge";
import { dealStatusLabel } from "@/lib/deals";

const VARIANT = { open: "secondary", completed: "default", cancelled: "outline" } as const;

/** Reserved / Sold / Cancelled, as in section 2.3. */
export function DealStatusBadge({ status }: { status: string | null | undefined }) {
  return <Badge variant={VARIANT[status as keyof typeof VARIANT] ?? "outline"}>{dealStatusLabel(status)}</Badge>;
}
