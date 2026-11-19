"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CLOSED_STATUSES, isOverdue, OPEN_STATUSES, stageOf, type Repair } from "@/lib/repairs/model";
import { approveRepairsAction, rejectRepairsAction, updateRepairAction } from "./actions";

type Tab = "pending" | "open" | "closed";
const TABS: [Tab, string][] = [["pending", "Waiting for approval"], ["open", "Open"], ["closed", "Done and closed"]];
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }) : "");

function Job({ r, today, canDecide }: { r: Repair; today: string; canDecide: boolean }) {
  const [busy, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ status: r.status ?? "", estTimeline: r.estTimeline ?? "", supplier: r.supplier ?? "", note: "" });
  const late = isOverdue(r, today);
  const save = () => start(async () => {
    const res = await updateRepairAction(r.id, { status: f.status !== r.status ? f.status : undefined, estTimeline: f.estTimeline !== (r.estTimeline ?? "") ? f.estTimeline : undefined, supplier: f.supplier !== (r.supplier ?? "") ? f.supplier : undefined, note: f.note || undefined });
    if (res.ok) { toast.success(res.message); setOpen(false); } else toast.error(res.error);
  });
  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{r.problem ?? "(no problem written)"}</span>
        {r.status && <Pill tone={stageOf(r) === "open" ? "amber" : stageOf(r) === "pending" ? "zinc" : stageOf(r) === "rejected" ? "red" : "emerald"}>{r.status}</Pill>}
        {late && <Pill tone="red">Late</Pill>}
        <span className="ml-auto text-muted-foreground">{r.supplier ? `${r.supplier}${r.company ? ` · ${r.company}` : ""}` : r.company ?? ""}{r.estTimeline ? ` · due ${/^\d{4}-/.test(r.estTimeline) ? day(r.estTimeline) : r.estTimeline}` : ""}</span>
      </div>
      {r.solution && <p className="mt-1 text-muted-foreground">{r.solution}</p>}
      {r.rejectReason && <p className="mt-1 text-red-700">Rejected: {r.rejectReason}</p>}
      {canDecide && r.approval === "approved" && (
        open ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <select className="h-9 rounded-md border bg-background px-2" aria-label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              {[...OPEN_STATUSES, ...CLOSED_STATUSES].map((s) => <option key={s}>{s}</option>)}
            </select>
            <Input aria-label="Due date or words" placeholder="Due (2026-11-25)" value={f.estTimeline} onChange={(e) => setF({ ...f, estTimeline: e.target.value })} />
            <Input aria-label="Who does it" placeholder="Supplier / person" value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} />
            <Input aria-label="Note" placeholder="Add a note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
            <div className="flex gap-2 sm:col-span-4"><Button size="sm" disabled={busy} onClick={save}>{busy ? <Loader2 className="animate-spin" /> : null}Save</Button><Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
          </div>
        ) : <button className="mt-2 text-xs underline underline-offset-2" onClick={() => setOpen(true)}>Update this job</button>
      )}
    </li>
  );
}

function Report({ plate, jobs, today, canDecide, pending }: { plate: string; jobs: Repair[]; today: string; canDecide: boolean; pending: boolean }) {
  const [busy, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const ids = jobs.map((j) => j.id);
  const first = jobs[0];
  const decide = (approve: boolean) => start(async () => {
    const res = approve ? await approveRepairsAction(ids) : await rejectRepairsAction(ids, reason);
    if (res.ok) toast.success(res.message); else toast.error(res.error);
  });
  const car = [first.ym, first.vehicle ?? first.brand].filter(Boolean).join(" ");
  return (
    <section className="rounded-xl ring-1 ring-foreground/10">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-3 text-sm">
        {first.unitId ? <Link href={`/documents/${plate}`} className="font-semibold underline-offset-2 hover:underline">{plate}</Link> : <span className="font-semibold">{plate}</span>}
        {car && <span className="text-muted-foreground">{car}</span>}
        {!first.unitId && <Pill tone="zinc">Not in Car documents</Pill>}
        {first.reportedBy && pending && <span className="text-muted-foreground">reported by {first.reportedBy}</span>}
        {pending && canDecide && (
          <span className="ml-auto flex flex-wrap items-center gap-2">
            {rejecting ? (
              <>
                <Input aria-label="Reason for rejecting" className="h-8 w-56" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                <Button size="sm" variant="destructive" disabled={busy || !reason.trim()} onClick={() => decide(false)}>{busy ? <Loader2 className="animate-spin" /> : <X />}Reject</Button>
                <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
              </>
            ) : (
              <>
                <Button size="sm" disabled={busy} onClick={() => decide(true)}>{busy ? <Loader2 className="animate-spin" /> : <Check />}Approve</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejecting(true)}>Reject</Button>
              </>
            )}
          </span>
        )}
      </header>
      <ul className="divide-y">{jobs.map((j) => <Job key={j.id} r={j} today={today} canDecide={canDecide} />)}</ul>
    </section>
  );
}

export function RepairsBoard({ repairs, today, canDecide }: { repairs: Repair[]; today: string; canDecide: boolean }) {
  const [tab, setTab] = useState<Tab>(repairs.some((r) => r.approval === "pending") ? "pending" : "open");
  const [q, setQ] = useState("");
  const counts = useMemo(() => ({ pending: repairs.filter((r) => stageOf(r) === "pending").length, open: repairs.filter((r) => stageOf(r) === "open").length, closed: repairs.filter((r) => ["closed", "rejected"].includes(stageOf(r))).length }), [repairs]);
  const shown = useMemo(() => {
    const want = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const mine = repairs.filter((r) => (tab === "closed" ? ["closed", "rejected"].includes(stageOf(r)) : stageOf(r) === tab) && (!want || r.plate.includes(want) || (r.problem ?? "").toUpperCase().includes(q.toUpperCase().trim())));
    const by = new Map<string, Repair[]>();
    for (const r of mine) { const k = `${r.plate}|${r.key?.replace(/-\d+(-u\d+)?$/, "") ?? r.id}`; (by.get(k) ?? by.set(k, []).get(k)!).push(r); }
    return [...by.values()];
  }, [repairs, tab, q]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(([t, label]) => <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)}>{label} ({counts[t]})</Button>)}
        <Input aria-label="Search repairs" className="ml-auto h-9 w-56" placeholder="Search plate or problem" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!shown.length ? <p className="text-sm text-muted-foreground">Nothing here.</p> : (
        <div className="space-y-4">{shown.map((jobs) => <Report key={jobs[0].id} plate={jobs[0].plate} jobs={jobs} today={today} canDecide={canDecide} pending={tab === "pending"} />)}</div>
      )}
    </div>
  );
}
