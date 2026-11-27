"use client";

import { useState } from "react";
import { Check, HandCoins, Loader2, PackageCheck, PackageOpen, Send } from "lucide-react";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Rules } from "@/lib/docs/stage";
import { stepsOf } from "@/lib/transfers/steps";
import { deliverTransferAction, handoffAction, releaseTransferAction, returnUnitAction, setHandoffCheckedAction } from "../actions";
import { AdminFixButton } from "./admin-fix";
import { useStep } from "./use-step";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila" }).format(new Date());

export interface HandoffData {
  plate: string; location: "available" | "sold"; soldCar?: boolean; recipient: string; at: string | null; note: string | null; checked: string[]; returnedAt: string | null;
  releasedOn: string | null; deliveredOn: string | null; stage?: string | null;
  items: { key: string; label: string; present: boolean; optional?: boolean }[];
}

/**
 * The transfer of the originals after the sale, in four steps on the car's sale record: With the liaison (the papers are handed to the receiver),
 * Back at MAD (the new CR is here), Released (given to the buyer or the financing company), Delivered (they confirmed). Available only after the folder is in Sold.
 */
export function HandoffCard({ data, rules, isAdmin = false, canEdit = true }: { data: HandoffData; rules: Pick<Rules, "handoff" | "markReturned">; isAdmin?: boolean; canEdit?: boolean }) {
  const soldCar = data.soldCar ?? data.location === "sold";
  const { busy, start, step, done, dialog } = useStep();
  const [checked, setChecked] = useState<string[]>(data.checked);
  const [note, setNote] = useState(data.note ?? "");
  const [to, setTo] = useState("");
  const [when, setWhen] = useState(today());
  const tick = (key: string, on: boolean) => { if (!canEdit) return; const next = on ? [...checked, key] : checked.filter((k) => k !== key); setChecked(next); void setHandoffCheckedAction(data.plate, next); };
  const { steps, next } = stepsOf({ handedOffAt: data.at, backAt: data.returnedAt, releasedOn: data.releasedOn, deliveredOn: data.deliveredOn, stage: data.stage });
  const out = !!data.at && !data.returnedAt;
  const title = next === null ? <Pill tone="emerald">Delivered{data.deliveredOn ? ` ${day(data.deliveredOn)}` : ""}</Pill> : next === "back" ? <Pill tone="amber">With {data.recipient} for {daysSince(data.at!)} days</Pill>
    : next === "released" ? <Pill tone="blue">Back at MAD{data.returnedAt ? ` ${day(data.returnedAt)}` : ""}</Pill> : next === "delivered" ? <Pill tone="purple">Released{data.releasedOn ? ` ${day(data.releasedOn)}` : ""}</Pill> : <Pill tone="zinc">Not handed off</Pill>;
  return (
    <Card id="handoff">
      <CardHeader><CardTitle className="flex flex-wrap items-center gap-3">Handoff to {data.recipient} {title}</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!soldCar ? (
          <p className="text-muted-foreground">This step comes after the sale. First the car is sold and its folder moved to Sold units.</p>
        ) : (
          <>
            <ol className="flex flex-wrap gap-x-2 gap-y-1.5" aria-label="The steps of the transfer">
              {steps.map((s, n) => (
                <li key={s.key} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${s.done ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200" : s.current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {s.done ? <Check className="size-3" aria-hidden /> : <span className="grid size-4 place-items-center rounded-full bg-foreground/10 text-[10px]">{n + 1}</span>}
                  {s.label}{s.date && <span className="opacity-70">· {day(s.date)}</span>}
                </li>
              ))}
            </ol>

            {!canEdit && next !== null && <p className="text-muted-foreground">Documentation does this transfer. You can follow where the papers are here.</p>}
            {canEdit && next === "out" && (
              <>
                <p className="text-muted-foreground">{data.returnedAt ? `The papers came back on ${day(data.returnedAt)}. You can hand them off again. ` : ""}Check each paper against the folder, then hand them off.</p>
                {data.items.length > 0 && <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
                  {data.items.map((i) => (
                    <li key={i.key}><label className="flex cursor-pointer items-center gap-3 px-3 py-2.5"><input type="checkbox" className="size-4" checked={checked.includes(i.key)} onChange={(e) => tick(i.key, e.target.checked)} />
                      <span className="flex-1">{i.label}</span>{!i.present && !i.optional && <Pill tone="amber">Missing</Pill>}</label></li>
                  ))}
                </ul>}
                <div className="space-y-1.5"><Label htmlFor="ho-note">Note (optional)</Label><Input id="ho-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></div>
                <Button disabled={busy || !rules.handoff.allowed} onClick={() => step("Hand off with things still open?", (c) => handoffAction(data.plate, note, c))}>{busy ? <Loader2 className="animate-spin" /> : <HandCoins />} Handed off to {data.recipient}</Button>
                {!rules.handoff.allowed && rules.handoff.reason && <p className="text-xs text-muted-foreground">{rules.handoff.reason}</p>}
              </>
            )}

            {canEdit && next === "back" && (
              <>
                <p>Handed off on {day(data.at!)}{data.note ? `: ${data.note}` : ""}. You are reminded on Telegram every 3 days until the papers are back.</p>
                <Button disabled={busy || !rules.markReturned.allowed} onClick={() => start(async () => done(await returnUnitAction(data.plate)))}>{busy ? <Loader2 className="animate-spin" /> : <PackageCheck />} Mark as done: documents are back</Button>
              </>
            )}

            {canEdit && next === "released" && (
              <>
                <p>The originals are back at MAD{data.returnedAt ? "" : " (the date was not recorded)"}. When they are given to the buyer or to the financing company, say who and when.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label htmlFor="rel-to">Given to</Label><Input id="rel-to" value={to} maxLength={70} placeholder="The buyer, GDFI, SAFC…" onChange={(e) => setTo(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label htmlFor="rel-on">Date</Label><Input id="rel-on" type="date" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
                </div>
                <Button disabled={busy || !when} onClick={() => start(async () => done(await releaseTransferAction(data.plate, to, when)))}>{busy ? <Loader2 className="animate-spin" /> : <Send />} Released</Button>
              </>
            )}

            {canEdit && next === "delivered" && (
              <>
                <p>Released{data.releasedOn ? ` on ${day(data.releasedOn)}` : ""}. When the buyer or the bank confirms they have the originals, the transfer is finished.</p>
                <div className="max-w-xs space-y-1.5"><Label htmlFor="del-on">Date they received it</Label><Input id="del-on" type="date" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
                <Button disabled={busy || !when} onClick={() => start(async () => done(await deliverTransferAction(data.plate, when)))}>{busy ? <Loader2 className="animate-spin" /> : <PackageOpen />} Delivered: they have it</Button>
              </>
            )}

            {next === null && <p className="text-muted-foreground">The transfer is finished: the buyer or the bank has the originals{data.deliveredOn ? ` (${day(data.deliveredOn)})` : " (the date was not recorded)"}.</p>}
          </>
        )}

        {isAdmin && canEdit && !!data.at && soldCar && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Admin: correct this transfer</p>
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
              {(data.returnedAt || data.releasedOn || data.deliveredOn) && <AdminFixButton plate={data.plate} fix={{ kind: "step-back" }} label="Go back one step" title="Go back one step?" warning="The last step of the transfer is taken back (Delivered, then Released, then Back at MAD). Nothing else changes." confirmLabel="Yes, go back one step" />}
              {data.returnedAt && <AdminFixButton plate={data.plate} fix={{ kind: "handoff-reopen" }} label="The papers are not back after all" title="Mark the papers as not back?" warning="The handoff is open again, anything after it is cleared, and the Telegram reminder every 3 days starts again." confirmLabel="Yes, reopen it" />}
              <AdminFixButton plate={data.plate} fix={{ kind: "handoff-undo" }} label="Undo the handoff" title="Undo the handoff?" warning="The car goes back to Not handed off, with no reminders and none of the later steps. It can be handed off again afterwards. The record in the history stays." confirmLabel="Yes, undo it" />
            </div>
          </div>
        )}
        {dialog}
      </CardContent>
    </Card>
  );
}
