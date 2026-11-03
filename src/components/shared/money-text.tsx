import { formatPeso } from "@/lib/rules/money";
import { pesos } from "@/lib/deals";
import { cn } from "@/lib/utils";

/**
 * Every peso amount on screen goes through this: tabular numbers so columns line up, and never
 * truncated. Pass `value` in pesos (as stored in the database) or `centavos` from the rules code.
 */
export function MoneyText({
  value,
  centavos,
  className,
}: {
  value?: number | string | null;
  centavos?: number | null;
  className?: string;
}) {
  const text = centavos !== undefined && centavos !== null ? formatPeso(centavos) : pesos(value);
  return <span className={cn("tabular-nums whitespace-nowrap", className)}>{text}</span>;
}
