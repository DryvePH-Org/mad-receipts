"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { cleanMoney, prettyMoney } from "./form-state";

/** A peso box: only digits, comma and point while typing; neat commas once you leave it. */
export function MoneyInput({ id, value, onChange, prefix = "₱", placeholder = "0", className, invalid, disabled, "aria-label": aria }: {
  id?: string; value: string; onChange: (v: string) => void; prefix?: string; placeholder?: string; className?: string; invalid?: boolean; disabled?: boolean; "aria-label"?: string;
}) {
  return (
    <div className="flex w-full">
      <span className="grid shrink-0 place-items-center rounded-l-lg border border-r-0 bg-muted px-2.5 text-sm text-muted-foreground">{prefix}</span>
      <Input id={id} aria-label={aria} aria-invalid={invalid} disabled={disabled} inputMode="decimal" value={value} placeholder={placeholder} autoComplete="off"
        onChange={(e) => onChange(cleanMoney(e.target.value))} onBlur={(e) => onChange(prettyMoney(e.target.value.trim()))}
        className={cn("rounded-l-none text-right tabular-nums", className)} />
    </div>
  );
}
