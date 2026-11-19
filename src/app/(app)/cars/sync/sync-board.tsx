"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { FIELD_LABELS, type SyncField } from "@/lib/pricelist/import";
import { choicesFor } from "@/lib/pricelist/sync";
import type { SyncRow } from "@/lib/pricelist/sync-server";
import { cn } from "@/lib/utils";
import { settleAction } from "./actions";

const HELP: Partial<Record<SyncField, string>> = {
  docs_code: "This code was kept as typed. Say what it means to the team, then press Noted.",
  unmatched: "This car is on the price list but not in the Docs Bible. Add it with Add a car; the next import picks it up.",
  odd_value: "The price list has an odd value here. It was kept as typed. Fix it where the car is edited, then press Noted.",
};

function ItemRow({ item }: { item: SyncRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const choices = choicesFor(item.field);
  const run = (c: "list" | "docs" | "noted") => start(async () => { const r = await settleAction(item.id, c); if (r.ok) toast.success(r.decision); else toast.error(r.error); router.refresh(); });
  const showValues = item.field !== "unmatched" && item.field !== "odd_value" && item.field !== "docs_code";
  return (
    <div className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2"><Pill tone={item.status === "open" ? "amber" : "emerald"}>{item.status === "open" ? FIELD_LABELS[item.field] : "Settled"}</Pill>{item.status === "settled" && <span className="text-sm text-muted-foreground">{FIELD_LABELS[item.field]}: {item.decision}</span>}</div>
      {showValues ? (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-muted p-2.5"><p className="text-xs text-muted-foreground">Price list says</p><p className="font-medium break-words">{item.listValue || "—"}</p></div>
          <div className="rounded-lg bg-muted p-2.5"><p className="text-xs text-muted-foreground">Docs Bible says</p><p className="font-medium break-words">{item.docsValue || "—"}</p></div>
        </div>
      ) : <p className="text-sm">{item.message}</p>}
      {HELP[item.field] && item.status === "open" && <p className="text-xs text-muted-foreground">{HELP[item.field]}</p>}
      {item.status === "open" && (
        <div className="flex flex-wrap gap-2">
          {choices.includes("list") && <Button size="sm" disabled={pending} onClick={() => run("list")}>{pending && <Loader2 className="animate-spin" />} Use the price list&apos;s</Button>}
          {choices.includes("docs") && <Button size="sm" variant="outline" disabled={pending} onClick={() => run("docs")}>Use the Docs Bible&apos;s</Button>}
          {item.field === "unmatched" && <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/documents/add" />}>Add the car</Button>}
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("noted")}>{item.field === "status" || showValues ? "Leave as it is" : "Noted"}</Button>
        </div>
      )}
    </div>
  );
}

export function SyncBoard({ items }: { items: SyncRow[] }) {
  const [showDone, setShowDone] = useState(false);
  const [field, setField] = useState<SyncField | "all">("all");
  const open = items.filter((i) => i.status === "open"), done = items.filter((i) => i.status === "settled");
  const fields = useMemo(() => [...new Set(open.map((i) => i.field))], [open]);
  const shown = (showDone ? done : open).filter((i) => field === "all" || i.field === field);
  const cars = useMemo(() => { const m = new Map<string, SyncRow[]>(); for (const i of shown) m.set(i.plate, [...(m.get(i.plate) ?? []), i]); return [...m.entries()]; }, [shown]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant={!showDone && field === "all" ? "default" : "outline"} onClick={() => { setShowDone(false); setField("all"); }}>All open ({open.length})</Button>
        {fields.map((f) => <Button key={f} size="sm" variant={!showDone && field === f ? "default" : "outline"} onClick={() => { setShowDone(false); setField(f); }}>{FIELD_LABELS[f]} ({open.filter((i) => i.field === f).length})</Button>)}
        <Button size="sm" variant={showDone ? "default" : "outline"} className="ml-auto" onClick={() => setShowDone(true)}>Settled ({done.length})</Button>
      </div>
      {cars.length === 0 ? (
        <EmptyState icon={CircleCheck} title={showDone ? "Nothing settled yet" : "The two are in step"} description={showDone ? "Settled items show here." : "The price list and the Docs Bible say the same about every car."} />
      ) : (
        <div className="space-y-3">
          {cars.map(([plate, list]) => (
            <section key={plate} className={cn("rounded-xl p-4 ring-1 ring-foreground/10")}>
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3"><Link href={`/documents/${plate.replace(/[^A-Za-z0-9]/g, "")}`} className="font-mono text-sm font-semibold underline-offset-2 hover:underline">{plate || "No plate"}</Link><span className="text-sm text-muted-foreground">{list[0].car}</span></div>
              <div className="divide-y">{list.map((i) => <ItemRow key={i.id} item={i} />)}</div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
