"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveApprovalChainAction } from "./chain-actions";

export interface ChainCandidate { userId: string; name: string; role: string; connected: boolean }
export interface ChainRow { userId: string; waitMinutes: number }

const WAITS = [30, 60, 120, 180, 240, 480];
const waitLabel = (m: number) => (m < 60 ? `${m} min` : `${m / 60} hour${m === 60 ? "" : "s"}`);

/** Who is asked first to approve a repair report on Telegram, and who next when nobody decides in time. */
export function ChainPanel({ candidates, initial, open = false }: { candidates: ChainCandidate[]; initial: ChainRow[]; open?: boolean }) {
  const [rows, setRows] = useState<ChainRow[]>(initial);
  const [busy, start] = useTransition();
  const by = new Map(candidates.map((c) => [c.userId, c]));
  const free = candidates.filter((c) => !rows.some((r) => r.userId === c.userId));
  const move = (i: number, d: number) => setRows((x) => { const y = [...x]; const j = i + d; if (j < 0 || j >= y.length) return x; [y[i], y[j]] = [y[j], y[i]]; return y; });
  const save = () => start(async () => { const r = await saveApprovalChainAction(rows); if (r.ok) toast.success("Saved."); else toast.error(r.error); });
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  return (
    <details open={open} className="rounded-xl ring-1 ring-foreground/10">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Who approves repair reports on Telegram, in what order ({rows.length})</summary>
      <div className="space-y-3 border-t px-4 py-4 text-sm">
        <p className="text-muted-foreground">A new report goes to the first person, with Approve and Reject buttons in their MAD Notification chat. If nobody decides in the time shown, the next person is asked, and so on; after the last, it goes round again. Nothing is sent from 21:00 to 07:00. With nobody in the list, everyone who can decide is told, as before.</p>
        {rows.length > 0 && (
          <ol className="divide-y rounded-lg ring-1 ring-foreground/10">
            {rows.map((r, i) => {
              const c = by.get(r.userId);
              return (
                <li key={r.userId} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="w-5 text-muted-foreground">{i + 1}.</span>
                  <span className="font-medium">{c?.name ?? "Unknown"}</span>
                  <span className="text-muted-foreground">{c?.role}</span>
                  {c && !c.connected && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-900">Telegram not connected: skipped</span>}
                  <label className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">then after
                    <select className="h-8 rounded-md border bg-background px-1.5 text-foreground" aria-label="Time before the next person" value={r.waitMinutes} onChange={(e) => setRows((x) => x.map((y) => (y.userId === r.userId ? { ...y, waitMinutes: Number(e.target.value) } : y)))}>
                      {(WAITS.includes(r.waitMinutes) ? WAITS : [...WAITS, r.waitMinutes].sort((a, b) => a - b)).map((m) => <option key={m} value={m}>{waitLabel(m)}</option>)}
                    </select>
                  </label>
                  <Button size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDown /></Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => setRows((x) => x.filter((y) => y.userId !== r.userId))}><X /></Button>
                </li>
              );
            })}
          </ol>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <select className="h-9 rounded-md border bg-background px-2" aria-label="Add a person" value="" onChange={(e) => { if (e.target.value) setRows((x) => [...x, { userId: e.target.value, waitMinutes: 120 }]); }}>
            <option value="">Add a person…</option>
            {free.map((c) => <option key={c.userId} value={c.userId}>{c.name} ({c.role}){c.connected ? "" : " · Telegram not connected"}</option>)}
          </select>
          <Button size="sm" disabled={busy || !dirty} onClick={save}>Save the order</Button>
        </div>
      </div>
    </details>
  );
}
