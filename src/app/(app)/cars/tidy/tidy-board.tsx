"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { TidyItem } from "@/lib/cars/tidy";
import { applyTidyAction } from "../actions";

const keyOf = (i: TidyItem) => `${i.unitId}|${i.field}`;

/** The values that do not follow the standard, grouped by what they are. Tick the fixes to approve (the suggested ones are ticked), change a value if needed, and apply. */
export function TidyBoard({ items }: { items: TidyItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [keyOf(i), i.suggestion ?? ""])));
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map((i) => [keyOf(i), i.suggestion !== null])));
  const [field, setField] = useState("all");
  const fields = useMemo(() => [...new Set(items.map((i) => i.label))], [items]);
  const shown = items.filter((i) => field === "all" || i.label === field);
  const ready = shown.filter((i) => on[keyOf(i)] && chosen[keyOf(i)].trim());
  const needChoice = items.filter((i) => i.suggestion === null).length;

  if (items.length === 0) return <EmptyState icon={CircleCheck} title="Everything follows the standard" description="No car detail needs tidying." />;

  const apply = () => start(async () => {
    const r = await applyTidyAction(ready.map((i) => ({ unitId: i.unitId, field: i.field, value: chosen[keyOf(i)] })));
    if (r.ok) { toast.success(r.message); router.refresh(); } else toast.error(r.error);
  });
  const all = (value: boolean) => setOn((o) => ({ ...o, ...Object.fromEntries(shown.map((i) => [keyOf(i), value && chosen[keyOf(i)].trim() !== ""])) }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Which detail">
        {["all", ...fields].map((f) => <button key={f} type="button" role="tab" aria-selected={field === f} onClick={() => setField(f)} className={`rounded-full border px-3 py-1 text-sm ${field === f ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{f === "all" ? `All (${items.length})` : `${f} (${items.filter((i) => i.label === f).length})`}</button>)}
        <span className="ml-auto flex gap-2"><Button size="sm" variant="outline" onClick={() => all(true)}>Tick all</Button><Button size="sm" variant="outline" onClick={() => all(false)}>Untick all</Button></span>
      </div>
      {needChoice > 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{needChoice} {needChoice === 1 ? "value has" : "values have"} no suggested fix: choose the right one, then tick it.</p>}
      <ul className="divide-y rounded-xl ring-1 ring-foreground/10" aria-label="Values to tidy">
        {shown.map((i) => {
          const k = keyOf(i);
          return (
            <li key={k} className="grid gap-2 p-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center sm:gap-4">
              <input type="checkbox" className="size-5" aria-label={`Apply the fix for ${i.car}: ${i.label}`} checked={!!on[k]} disabled={!chosen[k].trim()} onChange={(e) => setOn({ ...on, [k]: e.target.checked })} />
              <div className="min-w-0"><p className="truncate text-sm font-medium">{i.car}</p><p className="font-mono text-xs text-muted-foreground">{i.plateDisplay} · {i.label}</p></div>
              <div className="min-w-0 text-sm"><p className="text-xs text-muted-foreground">Now</p><p className="break-words font-medium">{i.current}</p></div>
              <div className="min-w-0 space-y-1">
                <p className="text-xs text-muted-foreground">{i.suggestion !== null ? "Becomes" : "Choose"}</p>
                {i.options ? (
                  <NativeSelect aria-label={`${i.label} of ${i.car}`} value={chosen[k]} onChange={(e) => { setChosen({ ...chosen, [k]: e.target.value }); setOn({ ...on, [k]: e.target.value !== "" }); }}>
                    <option value="">(choose)</option>{i.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </NativeSelect>
                ) : (
                  <Input aria-label={`${i.label} of ${i.car}`} value={chosen[k]} onChange={(e) => { setChosen({ ...chosen, [k]: e.target.value }); setOn({ ...on, [k]: e.target.value.trim() !== "" }); }} />
                )}
                <p className="text-xs text-muted-foreground">{i.reason}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-b-xl">
        <Button disabled={pending || ready.length === 0} onClick={apply}>{pending && <Loader2 className="animate-spin" />} Apply {ready.length} {ready.length === 1 ? "fix" : "fixes"}</Button>
        <span className="text-sm text-muted-foreground">{items.length} to tidy in all. Each value is checked again when it is saved.</span>
      </div>
    </div>
  );
}
