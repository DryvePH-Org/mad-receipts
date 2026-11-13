"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CircleAlert, ExternalLink, FileText, FolderInput, Loader2, Minus, RefreshCw, ScanText, X } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Pill, type Tone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { CASE_LABELS, CASES, CHOOSABLE, DOC_LABELS, type CaseType, type DocType } from "@/lib/docs/types";
import { chooseFolderAction, moveToSoldAction, readNextAction, relinkAction, rescanAction, setCaseAction, setFileTypesAction } from "../actions";

export interface CarViewData {
  plate: string; plateDisplay: string; name: string; location: "available" | "sold"; match: "linked" | "none" | "several"; folderUrl: string | null;
  candidates: { id: string; name: string; url: string; root: string }[];
  caseType: CaseType; suggestedCase: CaseType; caseSource: "auto" | "manual";
  deal: { id: string; dealNo: string; buyerName: string; hasReceipt: boolean } | null;
  items: { key: string; label: string; stage: "available" | "sold"; present: boolean; fileIds: string[] }[];
  files: { id: string; rotation: number; name: string; url: string | null; source: string; readStatus: string; readError: string | null; types: string[]; manual: boolean; flags: string[]; duplicateOf: string | null; confidence: number | null }[];
  scanned: boolean; pending: number; failed: number; statusLabel: string; statusKey: string;
}

const STATUS_TONE: Record<string, Tone> = { complete: "emerald", missing: "amber", review: "red", unread: "blue", unlinked: "zinc" };

export function CarView({ data }: { data: CarViewData }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [reading, setReading] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveMissing, setMoveMissing] = useState<string[] | null>(null);
  const asked = useRef(false);
  const unchecked = !data.scanned || data.pending > 0; // the list is not final until every photo has been read

  // A car whose folder was never listed lists its files the first time it is opened (no AI is used for this).
  useEffect(() => {
    if (data.match !== "linked" || data.scanned || asked.current) return;
    asked.current = true;
    void rescanAction(data.plate).then((r) => { if (!r.ok) toast.error(r.message); router.refresh(); });
  }, [data.match, data.scanned, data.plate, router]);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) => start(async () => { const r = await fn(); if (r.ok) toast.success(r.message); else toast.error(r.message); router.refresh(); });

  /** Reads the waiting photos two at a time, until none is left or the AI service asks to wait. */
  async function readAll(retryFailed: boolean) {
    let total = 0, retry = retryFailed;
    for (let guard = 0; guard < 60; guard++) {
      setReading(total ? `Reading… ${total} done` : "Reading…");
      const r = await readNextAction(data.plate, retry);
      retry = false; // failed ones are retried once, at the start
      total += r.read;
      router.refresh();
      if (r.error && !r.waitSeconds) { toast.error(r.error); break; }
      if (r.waitSeconds) { setReading(`The AI reader needs a short rest… ${total} done so far`); await new Promise((res) => setTimeout(res, r.waitSeconds! * 1000)); continue; }
      if (r.remaining === 0) break;
    }
    setReading(null);
    toast.success(total ? `${total} photo${total === 1 ? "" : "s"} read.` : "Nothing to read.");
  }

  /** Always asks first. The dialog lists whatever is missing, so moving an incomplete car is a clear choice. */
  function openMove() {
    const flagged = data.files.filter((f) => f.flags.length > 0 || f.types.some((t) => t === "id_unmatched" || t === "deed_unmatched")).length;
    setMoveMissing([
      ...data.items.filter((i) => !i.present).map((i) => i.label),
      ...(data.pending ? [`${data.pending} photo${data.pending === 1 ? "" : "s"} not read yet`] : []),
      ...(flagged ? [`${flagged} file${flagged === 1 ? "" : "s"} still to check`] : []),
    ]);
    setMoveOpen(true);
  }

  async function doMove() {
    const r = await moveToSoldAction(data.plate, true); // the person has seen what is missing and chose to move
    if (r.ok) { toast.success("Moved to Sold."); setMoveOpen(false); router.refresh(); return; }
    toast.error("error" in r ? r.error : "Could not move it."); setMoveOpen(false);
  }

  const missing = data.items.filter((i) => !i.present);
  const before = data.items.filter((i) => i.stage === "available"), after = data.items.filter((i) => i.stage === "sold");
  const typeLabel = (t: string) => DOC_LABELS[t as DocType] ?? t;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={data.location === "sold" ? "teal" : "grey"}>{data.location === "sold" ? "In Sold units" : "In Available units"}</Pill>
        {data.match === "linked" && <Pill tone={STATUS_TONE[data.statusKey] ?? "grey"}>{data.statusLabel}</Pill>}
        {data.deal ? <Link href={`/deals/${data.deal.id}`} className="text-sm underline">{data.deal.dealNo} · {data.deal.buyerName}{data.deal.hasReceipt ? "" : " (no AR yet)"}</Link> : <span className="text-sm text-muted-foreground">No AR for this car yet</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" nativeButton={false} render={<a href={`/documents/${data.plate}/transmittal`} />}><FileText /> Transmittal receipt</Button>
          {data.folderUrl && <Button variant="outline" nativeButton={false} render={<a href={data.folderUrl} target="_blank" rel="noreferrer" />}><ExternalLink /> Open the folder</Button>}
          {data.match === "linked" && data.location === "available" && <Button disabled={busy} onClick={openMove}><FolderInput /> Move to Sold</Button>}
        </div>
      </div>

      {data.match !== "linked" && (
        <Card>
          <CardHeader><CardTitle>{data.match === "none" ? "No folder found for this plate" : "More than one folder matches this plate"}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{data.match === "none" ? "Create or rename the car's folder in Drive so its name ends with the plate in brackets, like “14 Toyota Vios (AAX-3622)”, then search again." : "Choose the right one. The others stay where they are."}</p>
            {data.candidates.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
                <span className="min-w-0 flex-1 truncate">{c.name} <span className="text-muted-foreground">({c.root})</span></span>
                <Button size="sm" variant="outline" nativeButton={false} render={<a href={c.url} target="_blank" rel="noreferrer" />}><ExternalLink /> Open</Button>
                <Button size="sm" disabled={busy} onClick={() => run(() => chooseFolderAction(data.plate, c.id))}>Use this one</Button>
              </div>
            ))}
            <Button variant="outline" disabled={busy} onClick={() => run(() => relinkAction(data.plate))}><RefreshCw /> Search Drive again</Button>
          </CardContent>
        </Card>
      )}

      {data.match === "linked" && (
        <>
          <Card>
            <CardHeader><CardTitle className="flex flex-wrap items-center gap-3">Checklist
              <label className="flex items-center gap-2 text-sm font-normal text-muted-foreground">Case
                <NativeSelect aria-label="Case" className="w-44" value={data.caseSource === "manual" ? data.caseType : "auto"} disabled={busy} onChange={(e) => run(() => setCaseAction(data.plate, e.target.value))}>
                  <option value="auto">Automatic: {CASE_LABELS[data.suggestedCase]}</option>
                  {CASES.map((c) => <option key={c} value={c}>{CASE_LABELS[c]}</option>)}
                </NativeSelect></label></CardTitle></CardHeader>
            <CardContent className="space-y-5">
              {([["Before the sale: the Available folder", before], ["After the sale: Sales provides these", after]] as const).map(([title, list]) => (
                <div key={title} className="space-y-2">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
                  <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
                    {list.map((i) => (
                      <li key={i.key} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                        <span className={i.present ? "text-emerald-700" : unchecked ? "text-muted-foreground" : "text-amber-700"} aria-hidden>{i.present ? <Check className="size-4" /> : unchecked ? <Minus className="size-4" /> : <X className="size-4" />}</span>
                        <span className="flex-1">{i.label}</span>
                        <span className={i.present ? "text-emerald-800 dark:text-emerald-300" : unchecked ? "text-muted-foreground" : "text-amber-800 dark:text-amber-300"}>{i.present ? "In the folder" : unchecked ? "Not checked yet" : "Missing"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="text-sm text-muted-foreground">{!data.scanned ? "Looking at the folder…" : data.pending > 0 ? `${data.pending} photo${data.pending === 1 ? " has" : "s have"} not been read yet, so this list is not final. Press “Read ${data.pending} photo${data.pending === 1 ? "" : "s"}” below.` : missing.length === 0 ? "Everything is in. The car can move to Sold." : `${missing.length} thing${missing.length === 1 ? " is" : "s are"} still missing.`}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex flex-wrap items-center gap-3">Files in the folder
              <span className="ml-auto flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy || !!reading} onClick={() => run(() => rescanAction(data.plate))}><RefreshCw /> Look for new files</Button>
                <Button size="sm" disabled={busy || !!reading || (data.pending === 0 && data.failed === 0)} onClick={() => readAll(data.pending === 0)}>{reading ? <Loader2 className="animate-spin" /> : <ScanText />}{reading ?? (data.pending ? `Read ${data.pending} photo${data.pending === 1 ? "" : "s"}` : data.failed ? `Try ${data.failed} again` : "All read")}</Button>
              </span></CardTitle></CardHeader>
            <CardContent>
              {!data.scanned ? <p className="text-sm text-muted-foreground">Looking at the folder…</p> : data.files.length === 0 ? <p className="text-sm text-muted-foreground">No files in this folder yet.</p> : (
                <ul className="divide-y">
                  {data.files.map((f) => <FileRow key={f.id} f={f} busy={busy} typeLabel={typeLabel} onSave={(types) => run(() => setFileTypesAction(f.id, types))} />)}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <ResponsiveDialog open={moveOpen} onOpenChange={setMoveOpen} title={moveMissing?.length ? "Move to Sold with things missing?" : "Move to Sold?"}
        description={moveMissing?.length ? "You can still move it. Nothing is deleted, and the files go with the folder." : "The whole folder, with every file in it, moves from Available units to Sold units."}>
        <div className="space-y-4">
          {moveMissing?.length ? <ul className="list-disc space-y-1 rounded-lg bg-amber-50 p-3 pl-7 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{moveMissing.map((m) => <li key={m}>{m}</li>)}</ul> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMoveOpen(false)}>Cancel</Button>
            <Button disabled={busy} onClick={() => start(doMove)}>{busy ? <Loader2 className="animate-spin" /> : <FolderInput />} {moveMissing?.length ? "Move anyway" : "Move to Sold"}</Button>
          </div>
        </div>
      </ResponsiveDialog>
    </div>
  );
}

function FileRow({ f, busy, typeLabel, onSave }: { f: CarViewData["files"][number]; busy: boolean; typeLabel: (t: string) => string; onSave: (types: string[] | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<string[]>(f.types);
  const unread = f.readStatus === "pending";
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {f.url ? <a href={f.url} target="_blank" rel="noreferrer" className="font-medium underline-offset-2 hover:underline">{f.name}</a> : <b className="font-medium">{f.name}</b>}
        {f.source === "upload" && <Pill tone="teal">From Sales</Pill>}
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {unread ? <Pill tone="blue">Not read yet</Pill> : f.readStatus === "failed" ? <Pill tone="red">Could not read</Pill> : f.readStatus === "unreadable" ? <Pill tone="red">Too unclear</Pill>
            : f.types.length === 0 ? <Pill tone="zinc">Nothing recognised</Pill> : f.types.map((t) => <Pill key={t} tone={t === "other" || t.endsWith("unmatched") ? "amber" : "emerald"}>{typeLabel(t)}</Pill>)}
          {f.manual && <Pill tone="purple">Set by a person</Pill>}
        </span>
      </div>
      {f.readStatus === "done" && <Thumb id={f.id} name={f.name} rotation={f.rotation} />}
      {f.flags.map((x) => <p key={x} className="flex gap-2 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />{x}</p>)}
      {f.readError && f.readStatus === "failed" && <p className="text-xs text-muted-foreground">{f.readError}</p>}
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
      ) : <button type="button" className="text-xs underline" disabled={busy} onClick={() => { setPicked(f.types.filter((t) => (CHOOSABLE as string[]).includes(t))); setEditing(true); }}>Change what this is</button>}
    </li>
  );
}

/** The photo shown upright, however it was taken. Only the view is turned; the file in Drive is never changed. Click to see it larger. */
function Thumb({ id, name, rotation }: { id: string; name: string; rotation: number }) {
  const [open, setOpen] = useState(false);
  const src = `/api/docs/file/${id}`;
  const turn = rotation ? { transform: `rotate(${rotation}deg)` } : undefined;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="grid size-24 place-items-center overflow-hidden rounded-lg border bg-muted" aria-label={`View ${name} larger`}>
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
