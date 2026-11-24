"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderSync, Loader2, Rows3, Search, SlidersHorizontal, Table2, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { GridRow, Role } from "@/lib/docsbible/grid";
import { orLabel } from "@/lib/docsbible/or-expiry";
import { PAYMENT_LABEL, PAYMENT_STATUSES, type PaymentStatus } from "@/lib/docs/payments";
import { seesSales } from "@/lib/roles";
import { CHIPS, filterUnified, FOLDER_FILTERS, STAGES, type ChipKey, type FolderFilter, type UnifiedRow } from "@/lib/docsbible/unified";
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
  const [folder, setFolder] = useState<FolderFilter>("all");
  const [orDue, setOrDue] = useState(false);
  const [pay, setPay] = useState<"all" | PaymentStatus>("all");
  const money = seesSales(role); // payments are money: Online Marketing does not see them
  const [pending, start] = useTransition();
  const count = (k: ChipKey) => filterUnified(rows, k, "", false, folder, orDue).length;
  const inFolder = (k: FolderFilter) => filterUnified(rows, "all", "", false, k).length;
  const shown = useMemo(() => filterUnified(rows, chip, q, attention, folder, orDue).filter((r) => pay === "all" || r.payment === pay), [rows, chip, q, attention, folder, orDue, pay]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const active = [
    ...(folder !== "all" ? [{ label: FOLDER_FILTERS.find((f) => f.key === folder)!.label, clear: () => setFolder("all") }] : []),
    ...(pay !== "all" ? [{ label: PAYMENT_LABEL[pay], clear: () => setPay("all") }] : []),
    ...(attention ? [{ label: "Needs attention", clear: () => setAttention(false) }] : []),
    ...(orDue ? [{ label: "OR due or late", clear: () => setOrDue(false) }] : []),
  ];
  const orCount = rows.filter((r) => r.or.state === "overdue" || r.or.state === "soon").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="View" className="inline-flex rounded-lg border p-0.5">
          <button type="button" role="tab" aria-selected={view === "list"} onClick={() => setView("list")} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1 text-sm", view === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}><Rows3 className="size-4" aria-hidden />List</button>
          <button type="button" role="tab" aria-selected={view === "table"} onClick={() => setView("table")} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1 text-sm", view === "table" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}><Table2 className="size-4" aria-hidden />Table</button>
        </div>
        {canAct && <Button type="button" size="sm" variant="outline" className="ml-auto" disabled={pending} onClick={() => start(async () => { const r = await refreshFoldersAction(); if (r.ok) toast.success(r.message); else toast.error(r.message); router.refresh(); })}>{pending ? <Loader2 className="animate-spin" /> : <FolderSync />} Refresh from Drive</Button>}
      </div>
      {openDecisions > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="min-w-0 flex-1">{openDecisions} things from the move off the Google Sheet still need a decision.</p>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/data-check?tab=move" />}>Open the data check</Button>
        </div>
      )}

      {view === "table" ? <DocsGrid initial={grid} role={role} /> : (
        <>
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-sm"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Plate, car, owner, buyer" aria-label="Search cars" className="pl-8" /></div>
            <Button type="button" variant={filtersOpen ? "secondary" : "outline"} aria-expanded={filtersOpen} aria-controls="more-filters" onClick={() => setFiltersOpen((o) => !o)}>
              <SlidersHorizontal /> Filters{active.length > 0 && <span className="ml-0.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{active.length}</span>}
            </Button>
          </div>
          <div role="tablist" aria-label="Stage" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {CHIPS.map((c) => (
              <button key={c.key} type="button" role="tab" aria-selected={chip === c.key} onClick={() => setChip(c.key)} className={cn("shrink-0 rounded-full border px-3 py-1 text-sm", chip === c.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{c.label} <span className="opacity-70">{count(c.key)}</span></button>
            ))}
          </div>
          {filtersOpen && (
            <div id="more-filters" className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1 text-sm"><span className="text-muted-foreground">Drive folder</span>
                <NativeSelect value={folder} onChange={(e) => setFolder(e.target.value as FolderFilter)} aria-label="Drive folder">
                  {FOLDER_FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label} ({inFolder(f.key)})</option>)}
                </NativeSelect></label>
              {money && <label className="space-y-1 text-sm"><span className="text-muted-foreground">Payment</span>
                <NativeSelect value={pay} onChange={(e) => setPay(e.target.value as "all" | PaymentStatus)} aria-label="Payment">
                  <option value="all">Any payment</option>
                  {PAYMENT_STATUSES.map((k) => <option key={k} value={k}>{PAYMENT_LABEL[k]} ({rows.filter((r) => r.payment === k).length})</option>)}
                </NativeSelect></label>}
              <div className="flex flex-col justify-end gap-2 text-sm sm:col-span-2 sm:flex-row sm:items-end sm:gap-5">
                <label className="flex items-center gap-2"><input type="checkbox" checked={attention} onChange={(e) => setAttention(e.target.checked)} /> Needs attention</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={orDue} onChange={(e) => setOrDue(e.target.checked)} /> OR due or late ({orCount})</label>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
            <span>{shown.length} of {rows.length} cars.</span>
            {active.map((f) => (
              <button key={f.label} type="button" onClick={f.clear} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground hover:bg-muted/70" aria-label={`Remove the filter ${f.label}`}>{f.label}<X className="size-3" aria-hidden /></button>
            ))}
            {(active.length > 0 || chip !== "all" || q) && <button type="button" className="text-xs underline underline-offset-2" onClick={() => { setChip("all"); setQ(""); setAttention(false); setFolder("all"); setOrDue(false); setPay("all"); }}>Clear all</button>}
            {active.length === 0 && chip === "all" && !q && <span>Click a car to see its photos, what is in and what is missing.</span>}
          </div>
          {shown.length === 0 ? (
            <EmptyState icon={FolderSync} title="Nothing here" description="Try another stage or another search." />
          ) : (
            <ul className="divide-y rounded-xl ring-1 ring-foreground/10">
              {shown.map((r) => (
                <li key={r.plate}>
                  <Link href={`/documents/${r.plate}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/50 sm:grid-cols-[7rem_minmax(0,1fr)_9rem_11rem_5rem]">
                    <b className="font-mono text-sm font-medium">{r.plateDisplay}</b>
                    <span className="order-last col-span-2 min-w-0 sm:order-none sm:col-span-1"><span className="block truncate text-sm">{r.car}</span><span className="block truncate text-xs text-muted-foreground">{r.buyer ? `Buyer ${r.buyer} · ` : ""}{money && r.payment ? `${PAYMENT_LABEL[r.payment as PaymentStatus]} · ` : ""}{r.papers ? <span className="sm:hidden">{r.papers.have}/{r.papers.need} papers{r.flagged || r.decisions > 0 ? " ⚠ " : " · "}</span> : null}{r.files} {r.files === 1 ? "photo" : "photos"}{r.location === "sold" ? " · folder in Sold" : ""}{r.or.state === "overdue" || r.or.state === "soon" ? <span className={r.or.state === "overdue" ? "font-medium text-red-700 dark:text-red-400" : "font-medium text-amber-700 dark:text-amber-400"}> · {orLabel(r.or)}</span> : null}</span></span>
                    <span className="hidden text-sm sm:block">{r.caseLabel}</span>
                    <span><Pill tone={STAGES[r.stage].tone}>{STAGES[r.stage].label}</Pill></span>
                    <span className="hidden items-center justify-end gap-1.5 text-sm tabular-nums sm:flex">{r.papers ? `${r.papers.have}/${r.papers.need}` : "—"}{(r.flagged || r.decisions > 0) && <TriangleAlert className="size-4 text-amber-600" aria-label="Needs attention" />}</span>
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
