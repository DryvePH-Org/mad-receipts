"use client";

import { useState } from "react";
import { HandCoins, Loader2, PackageCheck } from "lucide-react";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Rules } from "@/lib/docs/stage";
import { handoffAction, returnUnitAction, setHandoffCheckedAction } from "../actions";
import { AdminFixButton } from "./admin-fix";
import { useStep } from "./use-step";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));

export interface HandoffData { plate: string; location: "available" | "sold"; recipient: string; at: string | null; note: string | null; checked: string[]; returnedAt: string | null; items: { key: string; label: string; present: boolean; optional?: boolean }[] }

/** The last steps: tick the papers, hand them to the receiver, and mark it done when they are back. Available only after the folder is in Sold. */
export function HandoffCard({ data, rules, isAdmin = false }: { data: HandoffData; rules: Rules; isAdmin?: boolean }) {
  const { busy, start, step, done, dialog } = useStep();
  const [checked, setChecked] = useState<string[]>(data.checked);
  const [note, setNote] = useState(data.note ?? "");
  const tick = (key: string, on: boolean) => { const next = on ? [...checked, key] : checked.filter((k) => k !== key); setChecked(next); void setHandoffCheckedAction(data.plate, next); };
  const out = !!data.at && !data.returnedAt;
  return (
    <Card id="handoff">
      <CardHeader><CardTitle className="flex flex-wrap items-center gap-3">Handoff to {data.recipient}
        {data.returnedAt ? <Pill tone="emerald">Returned {day(data.returnedAt)}</Pill> : out ? <Pill tone="amber">With {data.recipient} for {daysSince(data.at!)} days</Pill> : <Pill tone="zinc">Not handed off</Pill>}</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        {data.location !== "sold" ? (
          <p className="text-muted-foreground">This step comes after the sale. First the folder is moved to Sold units.</p>
        ) : out ? (
          <>
            <p>Handed off on {day(data.at!)}{data.note ? `: ${data.note}` : ""}. You are reminded on Telegram every 3 days until you press the button below.</p>
            <Button disabled={busy || !rules.markReturned.allowed} onClick={() => start(async () => done(await returnUnitAction(data.plate)))}>{busy ? <Loader2 className="animate-spin" /> : <PackageCheck />} Mark as done: documents are back</Button>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">Check each paper against the folder, then hand them off.</p>
            <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
              {data.items.map((i) => (
                <li key={i.key}><label className="flex cursor-pointer items-center gap-3 px-3 py-2.5"><input type="checkbox" className="size-4" checked={checked.includes(i.key)} onChange={(e) => tick(i.key, e.target.checked)} />
                  <span className="flex-1">{i.label}</span>{!i.present && !i.optional && <Pill tone="amber">Missing</Pill>}</label></li>
              ))}
            </ul>
            <div className="space-y-1.5"><Label htmlFor="ho-note">Note (optional)</Label><Input id="ho-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></div>
            {data.returnedAt && <p className="text-muted-foreground">These documents came back on {day(data.returnedAt)}. You can hand them off again.</p>}
            <Button disabled={busy || !rules.handoff.allowed} onClick={() => step("Hand off with things still open?", (c) => handoffAction(data.plate, note, c))}>{busy ? <Loader2 className="animate-spin" /> : <HandCoins />} Handed off to {data.recipient}</Button>
            {!rules.handoff.allowed && rules.handoff.reason && <p className="text-xs text-muted-foreground">{rules.handoff.reason}</p>}
          </>
        )}
        {isAdmin && !!data.at && data.location === "sold" && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Admin: correct this handoff</p>
            {(out || data.returnedAt) && (
              <>
                <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
                  {data.items.map((i) => (
                    <li key={i.key}><label className="flex cursor-pointer items-center gap-3 px-3 py-2"><input type="checkbox" className="size-4" checked={checked.includes(i.key)} onChange={(e) => setChecked(e.target.checked ? [...checked, i.key] : checked.filter((k) => k !== i.key))} />
                      <span className="flex-1">{i.label}</span>{!i.present && !i.optional && <Pill tone="amber">Missing</Pill>}</label></li>
                  ))}
                </ul>
                <div className="space-y-1.5"><Label htmlFor="ho-note-admin">Note</Label><Input id="ho-note-admin" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></div>
              </>
            )}
            <div className="flex flex-wrap gap-2">
              <AdminFixButton plate={data.plate} fix={{ kind: "handoff-edit", note, checked }} label="Save the ticks and note" title="Change the handoff?" warning="The ticks and the note of this handoff are replaced with what you see now." confirmLabel="Yes, save the changes" />
              {data.returnedAt && <AdminFixButton plate={data.plate} fix={{ kind: "handoff-reopen" }} label="The papers are not back after all" title="Mark the papers as not back?" warning="The handoff is open again and the Telegram reminder every 3 days starts again." confirmLabel="Yes, reopen it" />}
              <AdminFixButton plate={data.plate} fix={{ kind: "handoff-undo" }} label="Undo the handoff" title="Undo the handoff?" warning="The car goes back to Not handed off, with no reminders. It can be handed off again afterwards. The record in the history stays." confirmLabel="Yes, undo it" />
            </div>
          </div>
        )}
        {dialog}
      </CardContent>
    </Card>
  );
}
