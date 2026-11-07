"use client";

import { useState, useTransition } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getReplayPlan, runReplayAction, type ReplayPlan } from "./replay-actions";

const ACTION: Record<string, [string, string]> = {
  change: ["Will change", "text-emerald-700"],
  conflict: ["Different in the live sheet", "text-amber-800"],
  missing: ["Not in the live sheet", "text-muted-foreground"],
  same: ["Already the same", "text-muted-foreground"],
};

/** Sends the transactions entered so far to the connected (live) sheets, after showing exactly what would change. */
export function ReplayPanel() {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<ReplayPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, start] = useTransition();
  const [running, run] = useTransition();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [logRows, setLogRows] = useState(true);
  const [drive, setDrive] = useState(true);
  const [typed, setTyped] = useState("");

  function openIt() {
    setOpen(true); setPlan(null); setError(null); setTyped("");
    start(async () => {
      const r = await getReplayPlan();
      if (!r.ok) return setError(r.error);
      setPlan(r.plan);
      setPicked(new Set(r.plan.cars.filter((c) => c.action === "change").map((c) => c.plate))); // only the clear ones are ticked; differences wait for a person
    });
  }
  const toggle = (plate: string) => setPicked((s) => { const n = new Set(s); if (n.has(plate)) n.delete(plate); else n.add(plate); return n; });
  const canRun = plan && typed.trim() === "REPLAY" && (picked.size > 0 || logRows || drive);

  function send() {
    run(async () => {
      const r = await runReplayAction({ plates: [...picked], logRows, drive }, typed);
      if (r.ok) { toast.success(r.message); setOpen(false); } else setError(r.error);
    });
  }

  return (
    <>
      <Button variant="outline" onClick={openIt}><Upload /> Replay to the live sheets</Button>
      <ResponsiveDialog open={open} onOpenChange={(o) => { if (!running) setOpen(o); }} title="Replay to the live sheets" className="sm:max-w-3xl"
        description="Sends the transactions entered so far to the sheets this app is connected to now. Nothing is written until you type REPLAY.">
        {loading && !plan && <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Reading the inventory sheet…</p>}
        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {plan && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="font-medium">Connected right now (check these are the LIVE ones)</p>
              <p className="text-muted-foreground">Inventory sheet <b className="font-mono">{plan.connected.inventory}</b> · Log sheet <b className="font-mono">{plan.connected.logSheet}</b> · Drive folder <b className="font-mono">{plan.connected.driveFolder}</b></p>
            </div>

            <div className="space-y-2 text-sm">
              <label className="flex cursor-pointer items-start gap-2"><input type="checkbox" className="mt-1" checked={logRows} onChange={(e) => setLogRows(e.target.checked)} /><span><b className="font-medium">Add the {plan.approvedReceipts} approved receipts to the log sheet.</b> Safe to repeat: rows are matched by receipt number.</span></label>
              <label className="flex cursor-pointer items-start gap-2"><input type="checkbox" className="mt-1" checked={drive} onChange={(e) => setDrive(e.target.checked)} /><span><b className="font-medium">File the receipts and proofs in the Drive folder.</b> Safe to repeat: a file that is already there is skipped.</span></label>
              <p className="text-xs text-muted-foreground">Telegram is never replayed, so old receipts are not posted to the group.</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Inventory sheet: {plan.cars.length} cars</p>
              {plan.cars.length === 0 ? <p className="text-sm text-muted-foreground">No car has an approved receipt yet.</p> : (
                <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border text-sm">
                  {plan.cars.map((c) => {
                    const [label, tone] = ACTION[c.action];
                    const can = c.action === "change" || c.action === "conflict";
                    return (
                      <li key={c.plate} className={cn("grid gap-1 p-2.5 sm:grid-cols-[auto_1fr]", c.action === "conflict" && "bg-amber-50/60 dark:bg-amber-500/5")}>
                        <input type="checkbox" aria-label={`Write the note for ${c.display}`} className="mt-1 sm:row-span-1" disabled={!can} checked={picked.has(c.plate)} onChange={() => toggle(c.plate)} />
                        <div className="min-w-0">
                          <p><b className="font-mono">{c.display}</b> <span className="text-muted-foreground">{c.makeType} · deal {c.dealNo}</span> <span className={cn("ml-1 text-xs font-medium", tone)}>{label}</span></p>
                          <p className="text-xs text-muted-foreground">{c.why}</p>
                          {can && <p className="text-xs break-words"><span className="text-muted-foreground">Live sheet now:</span> {c.current || "(empty)"} <span className="text-muted-foreground">→ would become:</span> <b className="font-medium">{c.next}</b></p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">Only clear changes are ticked. A car marked &quot;Different in the live sheet&quot; may have been updated by staff since, so it is left for you to decide.</p>
            </div>

            <div className="space-y-1.5"><Label htmlFor="replay-word">Type REPLAY to confirm</Label><Input id="replay-word" value={typed} placeholder="REPLAY" autoComplete="off" onChange={(e) => setTyped(e.target.value)} /></div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" disabled={running} onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={!canRun || running} onClick={send}>{running ? "Sending…" : `Send ${picked.size} inventory ${picked.size === 1 ? "note" : "notes"}${logRows || drive ? " and the rest" : ""}`}</Button>
            </div>
          </div>
        )}
      </ResponsiveDialog>
    </>
  );
}
