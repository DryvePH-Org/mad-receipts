"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, Printer, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { AskDialog } from "@/components/shared/ask-dialog";
import { PaperZoom } from "@/components/receipt/paper-zoom";
import { TransmittalPaper } from "@/components/receipt/transmittal-paper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TRANSMITTAL_ITEMS, type TransmittalData } from "@/lib/docs/transmittal";
import { halfOf, MM } from "@/lib/paper";
import { saveTransmittalAction } from "./actions";

/** Fill in the transmittal on screen: what the documents workflow found is already ticked, the rest is typed or ticked by hand. */
export function TransmittalEditor({ plate, initial, suggestion, saved }: { plate: string; initial: TransmittalData; suggestion: TransmittalData; saved: boolean }) {
  const [d, setD] = useState(initial);
  const [dirty, setDirty] = useState(!saved);
  const [pending, start] = useTransition();
  const [reset, setReset] = useState(false);
  const set = (patch: Partial<TransmittalData>) => { setD((x) => ({ ...x, ...patch })); setDirty(true); };
  const setItem = (key: string, patch: Partial<{ on: boolean; detail: string }>) => set({ items: { ...d.items, [key]: { on: d.items[key]?.on ?? false, detail: d.items[key]?.detail ?? "", ...patch } } });
  const setOther = (i: number, v: string) => set({ others: Object.assign([...d.others, "", "", ""].slice(0, 3), { [i]: v }) });

  function save(then?: () => void) {
    start(async () => {
      const r = await saveTransmittalAction(plate, d);
      if (r.ok) { setDirty(false); toast.success("Saved."); then?.(); } else { toast.error(r.error); if (/database update/.test(r.error)) then?.(); }
    });
  }
  const print = () => save(() => window.open(`/print/transmittal/${plate}`, "_blank", "noopener"));

  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.6);
  const half = halfOf("a4");
  const natural = Math.round(half.w * MM), naturalHeight = Math.round(half.h * MM);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const measure = () => setScale(Math.min(1, (el.clientWidth - 16) / natural));
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [natural]);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem] xl:items-start">
      <div className="space-y-5">
        <Card><CardHeader><CardTitle>The car</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="tm-make">Make / type</Label><Input id="tm-make" value={d.makeType} maxLength={150} onChange={(e) => set({ makeType: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="tm-plate">Plate no.</Label><Input id="tm-plate" className="font-mono uppercase" value={d.plate} maxLength={20} onChange={(e) => set({ plate: e.target.value.toUpperCase() })} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="tm-owner">Complete owner&apos;s name</Label><Input id="tm-owner" value={d.owner} maxLength={150} onChange={(e) => set({ owner: e.target.value })} /></div>
          </CardContent></Card>

        <Card><CardHeader><CardTitle>Papers and items handed over</CardTitle><p className="text-sm text-muted-foreground">Ticked for you when the car&apos;s folder has the paper. Tick anything else that is handed over, and type a number or note where there is a line.</p></CardHeader>
          <CardContent className="space-y-1">
            {TRANSMITTAL_ITEMS.map((it) => {
              const on = d.items[it.key]?.on ?? false, fromFolder = !!it.from && !!suggestion.items[it.key]?.on;
              return (
                <div key={it.key} className="grid items-center gap-2 py-1 sm:grid-cols-[minmax(0,1fr)_14rem]">
                  <label className="flex cursor-pointer items-start gap-2.5 text-sm"><input type="checkbox" className="mt-0.5 size-4" checked={on} onChange={(e) => setItem(it.key, { on: e.target.checked })} />
                    <span>{it.label}{fromFolder && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">in the folder</span>}</span></label>
                  {it.line ? <Input aria-label={`${it.label}: number or note`} placeholder="Number or note" className="h-8" value={d.items[it.key]?.detail ?? ""} maxLength={80} onChange={(e) => setItem(it.key, { detail: e.target.value, ...(e.target.value && !on ? { on: true } : {}) })} /> : <span className="max-sm:hidden" />}
                </div>
              );
            })}
            <div className="space-y-2 border-t pt-3"><Label>Others</Label>{[0, 1, 2].map((i) => <Input key={i} aria-label={`Other ${i + 1}`} value={d.others[i] ?? ""} maxLength={120} onChange={(e) => setOther(i, e.target.value)} placeholder={i === 0 ? "Anything else handed over" : ""} />)}</div>
            <div className="space-y-1.5 pt-2"><Label htmlFor="tm-note">Note</Label><Input id="tm-note" value={d.note} maxLength={300} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. Sent by LBC" /></div>
          </CardContent></Card>

        <Card><CardHeader><CardTitle>Who handed it over, and who received it</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="tm-prep">Prepared by</Label><Input id="tm-prep" value={d.preparedBy} maxLength={100} onChange={(e) => set({ preparedBy: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="tm-prepdate">Date</Label><Input id="tm-prepdate" type="date" value={d.preparedOn} onChange={(e) => set({ preparedOn: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor="tm-recv">Received by</Label><Input id="tm-recv" value={d.receivedBy} maxLength={100} onChange={(e) => set({ receivedBy: e.target.value })} placeholder="Leave empty to sign by hand" />
              <div className="flex flex-wrap gap-2 text-xs">{suggestion.receivedBy && d.receivedBy !== suggestion.receivedBy && <button type="button" className="rounded-md border px-2 py-1 hover:bg-muted" onClick={() => set({ receivedBy: suggestion.receivedBy })}>Use {suggestion.receivedBy}</button>}{d.receivedBy && <button type="button" className="rounded-md border px-2 py-1 hover:bg-muted" onClick={() => set({ receivedBy: "" })}>Clear, sign by hand</button>}</div></div>
            <div className="space-y-1.5"><Label htmlFor="tm-recvdate">Date received</Label><Input id="tm-recvdate" type="date" value={d.receivedOn} onChange={(e) => set({ receivedOn: e.target.value })} /></div>
          </CardContent></Card>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href={`/documents/${plate}`} />}><ChevronLeft /> Back to the car</Button>
          <Button variant="outline" onClick={() => setReset(true)}><RotateCcw /> Start again from the folder</Button>
          <span className="ml-auto text-sm text-muted-foreground" role="status">{dirty ? "Not saved yet" : "Saved"}</span>
          <Button variant="outline" disabled={pending || !dirty} onClick={() => save()}><Save /> Save</Button>
          <Button disabled={pending} onClick={print}><Printer /> Save and print</Button>
        </div>
      </div>

      <aside className="space-y-2 xl:sticky xl:top-6">
        <div className="flex items-center justify-between gap-2"><b className="text-sm font-medium">Preview</b>
          <PaperZoom width={natural} height={naturalHeight}><TransmittalPaper data={d} /></PaperZoom></div>
        <div ref={wrap} className="relative overflow-hidden rounded-xl bg-neutral-200 ring-1 ring-foreground/10 dark:bg-neutral-800" style={{ height: `${Math.round(naturalHeight * scale + 24)}px` }}>
          <div className="absolute top-3 origin-top-left" style={{ transform: `scale(${scale})`, left: `calc(50% - ${(natural * scale) / 2}px)` }}><TransmittalPaper data={d} /></div>
        </div>
        <p className="text-xs text-muted-foreground">This is how it prints. Print asks for the paper and the number of copies.</p>
      </aside>

      <AskDialog open={reset} onOpenChange={setReset} title="Start again from the folder?" description="Everything on this form goes back to what the car's documents show. Your own changes are lost." fields={[]} confirm="Start again"
        onConfirm={async () => { setD(suggestion); setDirty(true); }} />
    </div>
  );
}
