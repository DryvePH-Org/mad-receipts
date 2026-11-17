"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderSync, Loader2, Rows3, Search, Table2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GridRow, Role } from "@/lib/docsbible/grid";
import { CHIPS, filterUnified, STAGES, type ChipKey, type UnifiedRow } from "@/lib/docsbible/unified";
import { cn } from "@/lib/utils";
import { DocsGrid } from "../docs-bible/docs-grid";
import { refreshFoldersAction } from "./actions";

/** The Car documents module: the same cars as a list (quick information, click to open) or as the table that looks like the old sheet. */
export function DocumentsBoard({ rows, grid, role, canAct, openDecisions }: { rows: UnifiedRow[]; grid: GridRow[]; role: Role; canAct: boolean; openDecisions: number }) {
  const router = useRouter();
  const [view, setView] = useState<"list" | "table">("list");
  const [chip, setChip] = useState<ChipKey>("all");
  const [q, setQ] = useState("");
  const [attention, setAttention] = useState(false);
  const [pending, start] = useTransition();
  const count = (k: ChipKey) => filterUnified(rows, k, "", false).length;
  const shown = useMemo(() => filterUnified(rows, chip, q, attention), [rows, chip, q, attention]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="View" className="inline-flex rounded-lg border p-0.5">
          <button type="button" role="tab" aria-selected={view === "list"} onClick={() => setView("list")} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1 text-sm", view === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}><Rows3 className="size-4" aria-hidden />List</button>
          <button type="button" role="tab" aria-selected={view === "table"} onClick={() => setView("table")} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1 text-sm", view === "table" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}><Table2 className="size-4" aria-hidden />Table (like the sheet)</button>
        </div>
        {canAct && <Button type="button" size="sm" variant="outline" className="ml-auto" disabled={pending} onClick={() => start(async () => { const r = await refreshFoldersAction(); if (r.ok) toast.success(r.message); else toast.error(r.message); router.refresh(); })}>{pending ? <Loader2 className="animate-spin" /> : <FolderSync />} Refresh from Drive</Button>}
      </div>
      {openDecisions > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="min-w-0 flex-1">{openDecisions} things from the move off the Google Sheet still need a decision.</p>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/docs-bible/review" />}>Open the review list</Button>
        </div>
      )}

      {view === "table" ? <DocsGrid initial={grid} role={role} /> : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Stage" className="inline-flex flex-wrap gap-1.5">
              {CHIPS.map((c) => (
                <button key={c.key} type="button" role="tab" aria-selected={chip === c.key} onClick={() => setChip(c.key)} className={cn("rounded-full border px-3 py-1 text-sm", chip === c.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{c.label} <span className="opacity-70">{count(c.key)}</span></button>
              ))}
            </div>
            <div className="relative ml-auto w-full sm:w-72"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Plate, car, owner, buyer" aria-label="Search cars" className="pl-8" /></div>
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={attention} onChange={(e) => setAttention(e.target.checked)} /> Needs attention</label>
          </div>
          <p className="text-sm text-muted-foreground">{shown.length} of {rows.length} cars. Click a car to see its photos, what is in and what is missing.</p>
          {shown.length === 0 ? (
            <EmptyState icon={FolderSync} title="Nothing here" description="Try another stage or another search." />
          ) : (
            <ul className="divide-y rounded-xl ring-1 ring-foreground/10">
              {shown.map((r) => (
                <li key={r.plate}>
                  <Link href={`/documents/${r.plate}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/50 sm:grid-cols-[7rem_minmax(0,1fr)_9rem_11rem_5rem]">
                    <b className="font-mono text-sm font-medium">{r.plateDisplay}</b>
                    <span className="order-last col-span-2 min-w-0 sm:order-none sm:col-span-1"><span className="block truncate text-sm">{r.car}</span><span className="block truncate text-xs text-muted-foreground">{r.buyer ? `Buyer ${r.buyer} · ` : ""}{r.files} {r.files === 1 ? "photo" : "photos"}{r.location === "sold" ? " · folder in Sold" : ""}</span></span>
                    <span className="hidden text-sm sm:block">{r.caseLabel}</span>
                    <span><Pill tone={STAGES[r.stage].tone}>{STAGES[r.stage].label}</Pill></span>
                    <span className="flex items-center justify-end gap-1.5 text-sm tabular-nums">{r.papers ? `${r.papers.have}/${r.papers.need}` : "—"}{(r.flagged || r.decisions > 0) && <TriangleAlert className="size-4 text-amber-600" aria-label="Needs attention" />}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
