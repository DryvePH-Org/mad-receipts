"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, HandCoins, Loader2, PackageCheck, Save } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { UnitDetails } from "@/lib/docs/details";
import { approveUnitAction, handoffAction, returnUnitAction, saveDetailsAction, setHandoffCheckedAction, type StepOutcome } from "../actions";

export interface UnitFlowData {
  plate: string; location: "available" | "sold"; recipient: string;
  details: UnitDetails; detailsMissing: string[];
  approvedAt: string | null; marketingNotifiedAt: string | null;
  handoff: { at: string | null; note: string | null; checked: string[]; returnedAt: string | null };
  items: { key: string; label: string; present: boolean }[];
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
const daysSince = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));

export function UnitFlow({ data }: { data: UnitFlowData }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [d, setD] = useState<UnitDetails>(data.details);
  const set = (patch: Partial<UnitDetails>) => setD((x) => ({ ...x, ...patch }));
  const [ask, setAsk] = useState<{ title: string; missing: string[]; go: () => void } | null>(null);
  const [checked, setChecked] = useState<string[]>(data.handoff.checked);
  const [note, setNote] = useState(data.handoff.note ?? "");

  const done = (r: { ok: boolean; message?: string }) => { if (r.ok) toast.success(r.message ?? "Done."); else toast.error(r.message ?? "Could not do that."); router.refresh(); };
  /** Runs a step that may need the person to confirm what is still open. */
  const step = (title: string, run: (confirm: boolean) => Promise<StepOutcome>) => start(async () => {
    const r = await run(false);
    if ("needsConfirm" in r) { setAsk({ title, missing: r.missing, go: () => start(async () => { setAsk(null); done(await run(true)); }) }); return; }
    done(r);
  });
  const tick = (key: string, on: boolean) => { const next = on ? [...checked, key] : checked.filter((k) => k !== key); setChecked(next); void setHandoffCheckedAction(data.plate, next); };

  const yn = (id: string, label: string, value: "yes" | "no" | "", onChange: (v: "yes" | "no" | "") => void) => (
    <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label>
      <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value as "yes" | "no" | "")}><option value="">Not answered</option><option value="yes">Yes</option><option value="no">No</option></NativeSelect></div>
  );
  const txt = (id: string, label: string, key: "casaWhen" | "casaWhere" | "batteryWhen" | "boughtFrom" | "note", max: number, placeholder?: string) => (
    <div className="space-y-1.5"><Label htmlFor={id}>{label}</Label><Input id={id} value={d[key]} maxLength={max} placeholder={placeholder} onChange={(e) => set({ [key]: e.target.value })} /></div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex flex-wrap items-center gap-3">About the car
          {data.detailsMissing.length ? <Pill tone="amber">{data.detailsMissing.length} to fill in</Pill> : <Pill tone="emerald">All filled in</Pill>}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {yn("ud-key", "Spare key", d.spareKey, (v) => set({ spareKey: v }))}
            {yn("ud-casa", "Maintained at the casa (dealer)", d.casaMaintained, (v) => set({ casaMaintained: v }))}
            {d.casaMaintained === "yes" && <>{txt("ud-casa-when", "Casa maintenance: when", "casaWhen", 60, "e.g. March 2026, 45,000 km")}{txt("ud-casa-where", "Casa maintenance: where", "casaWhere", 100, "e.g. Toyota Quezon Ave")}</>}
            {txt("ud-battery", "Battery: when it was changed", "batteryWhen", 60, "e.g. June 2026")}
            {txt("ud-bought", "Where the car was bought", "boughtFrom", 120)}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={d.isEv} onChange={(e) => set({ isEv: e.target.checked })} /> This is an electric car (EV)</label>
          {d.isEv && <div className="grid gap-4 sm:grid-cols-2">{yn("ud-charger", "EV charger", d.evCharger, (v) => set({ evCharger: v }))}{yn("ud-card", "EV charging card", d.evCard, (v) => set({ evCard: v }))}</div>}
          {txt("ud-note", "Note", "note", 300)}
          {data.detailsMissing.length > 0 && <p className="text-sm text-muted-foreground">Still blank: {data.detailsMissing.join("; ")}.</p>}
          <Button disabled={busy} onClick={() => start(async () => done(await saveDetailsAction(data.plate, d)))}>{busy ? <Loader2 className="animate-spin" /> : <Save />} Save the details</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex flex-wrap items-center gap-3">Approval
          {data.approvedAt ? <Pill tone="emerald">Approved {day(data.approvedAt)}</Pill> : <Pill tone="zinc">Not approved yet</Pill>}</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {data.approvedAt ? <p className="text-muted-foreground">{data.marketingNotifiedAt ? "Marketing was told on Telegram that this car is ready to market." : "Marketing could not be reached on Telegram. Tell them this car is ready."}</p>
            : <p className="text-muted-foreground">When you have checked the documents and the details above, approve. Marketing is told that the car is ready for photos, videos and posting.</p>}
          {!data.approvedAt && <Button disabled={busy} onClick={() => step("Approve with things still open?", (c) => approveUnitAction(data.plate, c))}>{busy ? <Loader2 className="animate-spin" /> : <BadgeCheck />} Approve: documents are OK</Button>}
        </CardContent>
      </Card>

      {data.location === "sold" && (
        <Card>
          <CardHeader><CardTitle className="flex flex-wrap items-center gap-3">Handoff to {data.recipient}
            {data.handoff.returnedAt ? <Pill tone="emerald">Returned {day(data.handoff.returnedAt)}</Pill> : data.handoff.at ? <Pill tone="amber">With {data.recipient} for {daysSince(data.handoff.at)} days</Pill> : <Pill tone="zinc">Not handed off</Pill>}</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            {!data.handoff.at || data.handoff.returnedAt ? (
              <>
                <p className="text-muted-foreground">Check each paper against the folder, then hand them off.</p>
                <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
                  {data.items.map((i) => (
                    <li key={i.key}><label className="flex cursor-pointer items-center gap-3 px-3 py-2.5"><input type="checkbox" className="size-4" checked={checked.includes(i.key)} onChange={(e) => tick(i.key, e.target.checked)} />
                      <span className="flex-1">{i.label}</span>{!i.present && <Pill tone="amber">Missing</Pill>}</label></li>
                  ))}
                </ul>
                <div className="space-y-1.5"><Label htmlFor="ho-note">Note (optional)</Label><Input id="ho-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></div>
                {data.handoff.returnedAt && <p className="text-muted-foreground">These documents came back on {day(data.handoff.returnedAt)}. You can hand them off again.</p>}
                <Button disabled={busy} onClick={() => step("Hand off with things still open?", (c) => handoffAction(data.plate, note, c))}>{busy ? <Loader2 className="animate-spin" /> : <HandCoins />} Handed off to {data.recipient}</Button>
              </>
            ) : (
              <>
                <p>Handed off on {day(data.handoff.at)}{data.handoff.note ? `: ${data.handoff.note}` : ""}. You are reminded on Telegram every 3 days until you press the button below.</p>
                <Button disabled={busy} onClick={() => start(async () => done(await returnUnitAction(data.plate)))}>{busy ? <Loader2 className="animate-spin" /> : <PackageCheck />} Mark as done: documents are back</Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <ResponsiveDialog open={!!ask} onOpenChange={(o) => !o && setAsk(null)} title={ask?.title ?? ""} description="You can still go on. Nothing is deleted.">
        <div className="space-y-4">
          <ul className="list-disc space-y-1 rounded-lg bg-amber-50 p-3 pl-7 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{ask?.missing.map((m) => <li key={m}>{m}</li>)}</ul>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAsk(null)}>Cancel</Button><Button disabled={busy} onClick={() => ask?.go()}>Go on anyway</Button></div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
