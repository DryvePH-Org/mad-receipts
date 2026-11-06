import { formatPHP } from "@/lib/pcf/money";
import { cn } from "@/lib/utils";

export function MoneyText({
  value,
  className,
}: {
  value: string | number;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums", className)}>{formatPHP(value)}</span>
  );
}
