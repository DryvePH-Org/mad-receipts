"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CLASSIFICATIONS } from "@/lib/docsbible/normalize";
import { KIND_LABELS, type ReviewKind } from "@/lib/docsbible/review";
import type { ReviewRow } from "@/lib/docsbible/review-server";
import { resolveReviewAction } from "./actions";

type Run = (a: Record<string, unknown>) => void;

export function ReviewBoard({ items, canEdit }: { items: ReviewRow[]; canEdit: boolean }) {
  const [kind, setKind] = useState<ReviewKind | "all">("all");
  const [showDone, setShowDone] = useState(false);
  const open = items.filter((i) => i.status === "open");
  const done = items.filter((i) => i.status !== "open");
  const kinds = useMemo(() => [...new Set(open.map((i) => i.kind))], [open]);
  const shown = (showDone ? done : open).filter((i) => kind === "all" || i.kind === kind);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={!showDone && kind === "all" ? "default" : "outline"} onClick={() => { setShowDone(false); setKind("all"); }}>All open ({open.length})</Button>
        {kinds.map((k) => <Button key={k} size="sm" variant={!showDone && kind === k ? "default" : "outline"} onClick={() => { setShowDone(false); setKind(k); }}>{KIND_LABELS[k]} ({open.filter((i) => i.kind === k).length})</Button>)}
        <Button size="sm" variant={showDone ? "default" : "ghost"} className="ml-auto" onClick={() => setShowDone(true)}>Settled ({done.length})</Button>
      </div>
      {!canEdit && <p className="rounded-lg bg-muted p-3 text-sm">You can look at this list. Documentation and Admin settle the items.</p>}
      {shown.length === 0 ? <p className="text-sm text-muted-foreground">{showDone ? "Nothing has been settled yet." : "Nothing is waiting for a decision."}</p> : (
        <ul className="space-y-3">{shown.map((i) => <Item key={i.id} item={i} canEdit={canEdit && i.status === "open"} />)}</ul>
      )}
    </div>
  );
}

function Item({ item, canEdit }: { item: ReviewRow; canEdit: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const run: Run = (a) => start(async () => { const r = await resolveReviewAction(item.id, a); if (r.ok) toast.success(r.message); else toast.error(r.message); router.refresh(); });
  const [text, setText] = useState("");
  const [cls, setCls] = useState("");
  const [sure, setSure] = useState<string | null>(null);
  const keep = <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ type: "keep" })}>{item.kind === "duplicate_plate" ? "Keep both: it arrived twice" : item.kind === "odd_plate" ? "The plate is right" : "Leave as it is"}</Button>;
  return (
    <li>
      <Card size="sm">
        <CardContent className="space-y-3 pt-4">
          <div className="flex flex-wrap items-start gap-2">
            <Pill tone={item.status === "open" ? "amber" : "emerald"}>{item.status === "open" ? KIND_LABELS[item.kind] : "Settled"}</Pill>
            <p className="min-w-0 flex-1 text-sm">{item.message}</p>
          </div>
          {item.units.length > 0 && (
            <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
              <table className="w-full min-w-[34rem] text-xs">
                <thead className="bg-muted/50 text-left text-muted-foreground"><tr>{["Sheet row", "Plate", "Car", "Arrived", "State", "Classification", ""].map((h) => <th key={h} className="px-2 py-1.5 font-medium">{h}</th>)}</tr></thead>
                <tbody className="divide-y">
                  {item.units.map((u) => (
                    <tr key={u.id} className={u.archived ? "opacity-50" : undefined}>
                      <td className="px-2 py-1.5">{u.source_row ?? "—"}</td><td className="px-2 py-1.5 font-mono">{u.plate_display}</td>
                      <td className="px-2 py-1.5">{[u.year_model, u.make, u.model_variant, u.color].filter(Boolean).join(" ") || "—"}</td>
                      <td className="px-2 py-1.5">{u.arrival_date ?? "—"}</td><td className="px-2 py-1.5">{u.stock_state ?? "—"}</td><td className="px-2 py-1.5">{u.classification}</td>
                      <td className="px-2 py-1.5 text-right">
                        {canEdit && item.kind === "duplicate_plate" && !u.archived && (sure === u.id
                          ? <Button size="xs" variant="destructive" disabled={busy} onClick={() => run({ type: "archive", unitId: u.id })}>Yes, remove this row</Button>
                          : <Button size="xs" variant="outline" disabled={busy} onClick={() => setSure(u.id)}>Double entry: remove</Button>)}
                        {u.archived && <span className="text-muted-foreground">removed</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {item.status !== "open" && item.decision && <p className="flex items-center gap-1.5 text-sm text-emerald-800 dark:text-emerald-300"><Check className="size-4" aria-hidden />{item.decision}</p>}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              {item.kind === "legacy_classification" && <>
                <NativeSelect aria-label="Classification" className="w-48" value={cls} onChange={(e) => setCls(e.target.value)}><option value="">Choose…</option>{CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}</NativeSelect>
                <Button size="sm" disabled={busy || !cls} onClick={() => run({ type: "classify", value: cls })}>Save</Button>
              </>}
              {item.kind === "no_plate" && <>
                <Input aria-label="Plate number" className="w-40" placeholder="Plate number" value={text} onChange={(e) => setText(e.target.value)} />
                <Button size="sm" disabled={busy || text.trim().length < 4} onClick={() => run({ type: "add_plate", plate: text })}>Add as a car</Button>
              </>}
              {item.kind === "sold_no_plate" && <>
                <Input aria-label="Plate number of the sale" className="w-40" placeholder="Plate number" value={text} onChange={(e) => setText(e.target.value)} />
                <Button size="sm" disabled={busy || text.trim().length < 3} onClick={() => run({ type: "add_sale_plate", plate: text })}>Record the sale</Button>
              </>}
              {item.kind === "odd_date" && <>
                <Input aria-label="Arrival date" className="w-44" placeholder="2026-07-10" value={text} onChange={(e) => setText(e.target.value)} />
                <Button size="sm" disabled={busy || !text.trim()} onClick={() => run({ type: "set_date", date: text })}>Save the date</Button>
              </>}
              {item.kind === "odd_plate" && <>
                <Input aria-label="Correct plate" className="w-40" placeholder="Correct plate" value={text} onChange={(e) => setText(e.target.value)} />
                <Button size="sm" disabled={busy || text.trim().length < 3} onClick={() => run({ type: "set_plate", plate: text })}>Correct the plate</Button>
              </>}
              {keep}
              {busy && <Loader2 className="size-4 animate-spin" aria-label="Saving" />}
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}
