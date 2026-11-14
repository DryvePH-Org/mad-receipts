"use client";

import { useState } from "react";
import { Check, FolderInput, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Rule } from "@/lib/docs/stage";
import { moveToSoldAction } from "../actions";
import { useStep } from "./use-step";

/** When the car is sold: the papers Sales uploads, and the button that moves the folder to Sold once they are all in. */
export function SoldCard({ plate, location, items, rule, isAdmin, openItems }: { plate: string; location: "available" | "sold"; items: { key: string; label: string; present: boolean }[]; rule: Rule; isAdmin: boolean; openItems: string[] }) {
  const { busy, start, done } = useStep();
  const [open, setOpen] = useState(false);
  const sold = location === "sold";
  async function move() {
    const r = await moveToSoldAction(plate, true); // the person has seen what is open and chose to go on
    if (r.ok) { toast.success("Moved to Sold."); setOpen(false); done({ ok: true }); return; }
    toast.error("error" in r ? r.error : "Could not move it."); setOpen(false);
  }
  return (
    <Card id="sold">
      <CardHeader><CardTitle className="flex flex-wrap items-center gap-3">Sold papers and the Sold folder
        {sold ? <Pill tone="teal">In Sold units</Pill> : <Pill tone="zinc">In Available units</Pill>}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
          {items.map((i) => (
            <li key={i.key} className="flex items-center gap-3 px-3 py-2.5">
              <span className={i.present ? "text-emerald-700" : "text-muted-foreground"} aria-hidden>{i.present ? <Check className="size-4" /> : <X className="size-4" />}</span>
              <span className="flex-1">{i.label}</span><span className={i.present ? "text-emerald-800 dark:text-emerald-300" : "text-muted-foreground"}>{i.present ? "Uploaded" : "Not yet"}</span>
            </li>
          ))}
        </ul>
        {sold ? <p className="text-muted-foreground">The folder is in Sold units. Next: the handoff.</p> : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !rule.allowed} onClick={() => setOpen(true)}>{busy ? <Loader2 className="animate-spin" /> : <FolderInput />} Move to Sold</Button>
              {!rule.allowed && rule.adminOverride && isAdmin && <Button variant="outline" disabled={busy} onClick={() => setOpen(true)}>Move anyway (Admin)</Button>}
            </div>
            {!rule.allowed && rule.reason && <p className="text-xs text-muted-foreground">{rule.reason}{rule.adminOverride && !isAdmin ? " Only an Admin can move it before then." : ""}</p>}
          </>
        )}
        <ResponsiveDialog open={open} onOpenChange={setOpen} title={rule.allowed ? "Move to Sold?" : "Move to Sold although things are open?"}
          description={rule.allowed ? "The whole folder, with every file in it, moves from Available units to Sold units." : "You are an Admin, so you can go past the rule. Nothing is deleted, and the files go with the folder."}>
          <div className="space-y-4">
            {!rule.allowed && rule.reason && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{rule.reason}</p>}
            {openItems.length > 0 && <ul className="list-disc space-y-1 rounded-lg bg-amber-50 p-3 pl-7 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{openItems.map((m) => <li key={m}>{m}</li>)}</ul>}
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={busy} onClick={() => start(move)}>{busy ? <Loader2 className="animate-spin" /> : <FolderInput />} {rule.allowed ? "Move to Sold" : "Move anyway"}</Button></div>
          </div>
        </ResponsiveDialog>
      </CardContent>
    </Card>
  );
}
