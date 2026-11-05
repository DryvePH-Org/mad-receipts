"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { FolderSync, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill, type Tone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CarRow } from "@/lib/docs/data";
import { cn } from "@/lib/utils";
import { refreshFoldersAction } from "./actions";

const TONE: Record<CarRow["status"]["key"], Tone> = { complete: "emerald", missing: "amber", review: "red", unread: "blue", unlinked: "zinc" };
type Tab = "attention" | "available" | "sold" | "all";
const TABS: { id: Tab; label: string }[] = [{ id: "attention", label: "Needs attention" }, { id: "available", label: "Available" }, { id: "sold", label: "Sold" }, { id: "all", label: "All" }];
const needsAttention = (r: CarRow) => r.status.key === "unlinked" || r.status.key === "review" || r.status.key === "unread" || r.match !== "linked";

export function CarsBoard({ rows }: { rows: CarRow[] }) {
  const [tab, setTab] = useState<Tab>(rows.some(needsAttention) ? "attention" : "available");
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const count = (t: Tab) => rows.filter((r) => (t === "attention" ? needsAttention(r) : t === "all" ? true : r.location === t)).length;
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => (tab === "attention" ? needsAttention(r) : tab === "all" ? true : r.location === tab) && words.every((w) => r.searchText.includes(w)));
  }, [rows, tab, q]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Show" className="inline-flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={cn("rounded-full border px-3 py-1 text-sm", tab === t.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>{t.label} <span className="opacity-70">{count(t.id)}</span></button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-72"><Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Plate, car, buyer" aria-label="Search" className="pl-8" /></div>
        <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => { const r = await refreshFoldersAction(); if (r.ok) toast.success(r.message); else toast.error(r.message); })}>
          {pending ? <Loader2 className="animate-spin" /> : <FolderSync />} Refresh from Drive</Button>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={FolderSync} title={rows.length === 0 ? "No cars yet" : "Nothing here"} description={rows.length === 0 ? "Press “Refresh from Drive” to read the Available and Sold folders. Cars also appear here by themselves when an AR is created." : "Try another tab or another search."} />
      ) : (
        <ul className="divide-y rounded-xl ring-1 ring-foreground/10">
          {shown.map((r) => (
            <li key={r.plate}>
              <Link href={`/documents/${r.plate}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/50">
                <span className="min-w-0 flex-1">
                  <b className="block truncate font-medium">{r.name}</b>
                  <span className="block truncate text-xs text-muted-foreground">{r.deal ? `${r.deal.dealNo} · ${r.deal.buyerName}${r.deal.hasReceipt ? "" : " · no AR"}` : "No AR yet"} · {r.files} {r.files === 1 ? "file" : "files"}</span>
                </span>
                <Pill tone={r.location === "sold" ? "teal" : "grey"}>{r.location === "sold" ? "Sold" : "Available"}</Pill>
                {r.match === "linked" && <Pill tone="grey">{r.caseLabel}</Pill>}
                <Pill tone={r.match === "linked" ? TONE[r.status.key] : "red"}>{r.match === "none" ? "No folder found" : r.match === "several" ? "Several folders" : r.status.label}</Pill>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
