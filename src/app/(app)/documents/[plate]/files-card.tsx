"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, CircleAlert, Loader2, RefreshCw, ScanText } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Rules } from "@/lib/docs/stage";
import { CHOOSABLE, DOC_LABELS, type Detection, type DocType } from "@/lib/docs/types";
import { readNextAction, rescanAction, setFileTypesAction } from "../actions";
import type { CarViewData, FileView } from "./types";

const typeLabel = (t: string) => DOC_LABELS[t as DocType] ?? t;

/** The car's photos: what the bot read from each, what it flagged, and the one button that scans what is waiting. */
export function FilesCard({ data, rules }: { data: CarViewData; rules: Rules }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [reading, setReading] = useState<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) => start(async () => { const r = await fn(); if (r.ok) toast.success(r.message); else toast.error(r.message); router.refresh(); });

  /** Reads the waiting photos two at a time (the picture API), or hands them to the bot, which scans them together in the background. */
  async function scan(retryFailed: boolean) {
    if (data.botMode) {
      const r = await readNextAction(data.plate, retryFailed);
      if (r.error) toast.error(r.error); else toast.success("The bot is scanning the photos. The result appears here by itself.");
      router.refresh();
      return;
    }
    let total = 0, retry = retryFailed;
    for (let guard = 0; guard < 60; guard++) {
      setReading(total ? `Reading… ${total} done` : "Reading…");
      const r = await readNextAction(data.plate, retry);
      retry = false;
      total += r.read;
      router.refresh();
      if (r.error && !r.waitSeconds) { toast.error(r.error); break; }
      if (r.waitSeconds) { setReading(`The AI reader needs a short rest… ${total} done so far`); await new Promise((res) => setTimeout(res, r.waitSeconds! * 1000)); continue; }
      if (r.remaining === 0) break;
    }
    setReading(null);
    toast.success(total ? `${total} photo${total === 1 ? "" : "s"} read.` : "Nothing to read.");
  }

  const label = data.scanning ? "The bot is scanning…" : reading ?? (data.pending ? `${data.botMode ? "Scan" : "Read"} ${data.pending} photo${data.pending === 1 ? "" : "s"}` : data.failed ? `Scan ${data.failed} again` : "All read");
  return (
    <Card id="files">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3">Photos in the folder
          <span className="text-sm font-normal text-muted-foreground">{data.files.length} file{data.files.length === 1 ? "" : "s"}</span>
          <span className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy || !!reading || data.scanning} onClick={() => run(() => rescanAction(data.plate))}><RefreshCw /> Look for new files</Button>
            <Button size="sm" disabled={busy || !!reading || !rules.scan.allowed} onClick={() => scan(data.pending === 0)}>{reading || data.scanning ? <Loader2 className="animate-spin" /> : <ScanText />}{label}</Button>
          </span>
        </CardTitle>
        {!rules.scan.allowed && rules.scan.reason && data.files.length > 0 && <p className="text-xs text-muted-foreground">{rules.scan.reason}</p>}
      </CardHeader>
      <CardContent>
        {!data.scanned ? <p className="text-sm text-muted-foreground">Looking at the folder…</p> : data.files.length === 0 ? <p className="text-sm text-muted-foreground">No photos in this folder yet. Use <b>Add documents</b> in Car documents to add them.</p> : (
          <ul className="divide-y">
            {data.files.map((f) => <FileRow key={f.id} f={f} busy={busy || data.scanning} onSave={(types) => run(() => setFileTypesAction(f.id, types))} />)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function FileRow({ f, busy, onSave }: { f: FileView; busy: boolean; onSave: (types: string[] | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<string[]>(f.types);
  const unread = f.readStatus === "pending";
  return (
    <li className="space-y-3 py-4">
      <div className="flex flex-wrap items-center gap-2">
        {f.url ? <a href={f.url} target="_blank" rel="noreferrer" className="font-medium underline-offset-2 hover:underline">{f.name}</a> : <b className="font-medium">{f.name}</b>}
        {f.source === "upload" && <Pill tone="teal">From Sales</Pill>}
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {unread ? <Pill tone="blue">Not read yet</Pill> : f.readStatus === "failed" ? <Pill tone="red">Could not read</Pill> : f.readStatus === "unreadable" ? <Pill tone="red">Too unclear</Pill>
            : f.types.length === 0 ? <Pill tone="zinc">Nothing recognised</Pill> : f.types.map((t) => <Pill key={t} tone={t === "other" || t.endsWith("unmatched") ? "amber" : "emerald"}>{typeLabel(t)}</Pill>)}
          {f.manual && <Pill tone="purple">Set by a person</Pill>}
        </span>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        {f.readStatus === "done" && <Thumb id={f.id} name={f.name} rotation={f.rotation} />}
        <div className="min-w-0 flex-1 space-y-2">
          {f.flags.map((x) => <p key={x} className="flex gap-2 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{x}</p>)}
          {f.readError && f.readStatus === "failed" && <p className="text-xs text-muted-foreground">{f.readError}</p>}
          {f.readStatus === "done" && <Seen f={f} />}
        </div>
      </div>
      {editing ? (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">What is in this photo? (tick more than one if it shows two documents)</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {CHOOSABLE.map((t) => <label key={t} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={picked.includes(t)} onChange={(e) => setPicked(e.target.checked ? [...picked, t] : picked.filter((x) => x !== t))} />{DOC_LABELS[t]}</label>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || picked.length === 0} onClick={() => { onSave(picked); setEditing(false); }}>Save</Button>
            {f.manual && <Button size="sm" variant="outline" disabled={busy} onClick={() => { onSave(null); setEditing(false); }}>Go back to what was read</Button>}
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : <button type="button" className="text-xs underline underline-offset-2 disabled:opacity-50" disabled={busy} onClick={() => { setPicked(f.types.filter((t) => (CHOOSABLE as string[]).includes(t))); setEditing(true); }}>Change what this is</button>}
    </li>
  );
}

const DETAIL_ROWS: [keyof Detection, string][] = [
  ["documentNumber", "Document number"], ["plate", "Plate"], ["motorNo", "Motor / engine no."], ["chassisNo", "Chassis no."], ["ownerName", "Registered owner"], ["holderName", "Name on the ID"], ["idType", "ID type"],
  ["sellerName", "Seller"], ["buyerName", "Buyer"], ["secretaryName", "Secretary"], ["representativeName", "Representative"], ["validUntil", "OR valid until"], ["lender", "Bank / lender"],
];

/** "What the bot saw": every document the bot found on this photo with what it read, how sure it was, and what it saw wrong with it. */
function Seen({ f }: { f: FileView }) {
  const dets = f.seen.detections;
  return (
    <details className="group rounded-lg border">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-xs font-medium"><ChevronDown className="size-3.5 transition group-open:rotate-180" aria-hidden /> What the bot saw{f.rotation ? ` · turned ${f.rotation}°` : ""}</summary>
      <div className="space-y-3 border-t p-3 text-sm">
        {dets.length === 0 ? <p className="text-muted-foreground">The bot did not recognise a document on this photo.</p> : dets.map((d, i) => (
          <div key={i} className="space-y-1.5">
            <p className="flex flex-wrap items-center gap-2 font-medium">{typeLabel(d.type)}
              <span className="text-xs font-normal text-muted-foreground">{Math.round(d.confidence * 100)}% sure of the type</span>
              {d.copy && <Pill tone={d.copy === "original" ? "emerald" : "amber"}>{d.copy === "original" ? "Original" : "Photocopy"}</Pill>}
              {d.defects?.length ? d.defects.map((x) => <Pill key={x} tone="red">{x}</Pill>) : <span className="text-xs font-normal text-emerald-800 dark:text-emerald-300">No damage seen</span>}
            </p>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
              {DETAIL_ROWS.filter(([k]) => d[k]).map(([k, name]) => <div key={k} className="flex gap-2"><dt className="w-36 shrink-0 text-xs text-muted-foreground">{name}</dt><dd className="min-w-0 break-words">{String(d[k])}</dd></div>)}
            </dl>
          </div>
        ))}
        {f.seen.notes && <p className="text-xs text-muted-foreground">Bot&apos;s note: {f.seen.notes}</p>}
        <p className="text-xs text-muted-foreground">A number or name the bot could not read in full is left blank, never guessed.</p>
      </div>
    </details>
  );
}

/** The photo shown upright, however it was taken. Only the view is turned; the file in Drive is never changed. Click to see it larger. */
function Thumb({ id, name, rotation }: { id: string; name: string; rotation: number }) {
  const [open, setOpen] = useState(false);
  const src = `/api/docs/file/${id}`;
  const turn = rotation ? { transform: `rotate(${rotation}deg)` } : undefined;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted" aria-label={`View ${name} larger`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={name} loading="lazy" className="max-h-24 max-w-24 object-contain" style={turn} />
      </button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={name} description={rotation ? `Turned ${rotation}° to read upright here. The file in Drive is not changed.` : undefined}>
        <div className="grid max-h-[75svh] place-items-center overflow-auto rounded-lg bg-muted p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={name} className="max-h-[70svh] max-w-full object-contain" style={turn} />
        </div>
      </ResponsiveDialog>
    </>
  );
}
