import { Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

/** The logo tile and name. */
export function Brand({ className, tagline = true }: { className?: string; tagline?: boolean }) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Receipt className="size-5" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold">MAD</span>
        {tagline && <span className="block text-xs text-muted-foreground">Invoice · PCF</span>}
      </span>
    </span>
  );
}
