"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, CircleAlert, Download, ExternalLink, Trash2 } from "lucide-react";
import { ImageStage } from "@/components/shared/image-viewer";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CHOOSABLE, DOC_LABELS, type Detection, type DocType } from "@/lib/docs/types";
import { editReadingAction, removeFileAction, rescanFileAction, reviewFlagAction } from "../actions";
import type { FileView } from "./types";

type Done = { ok: boolean; message: string };
type Run = (fn: () => Promise<Done>) => void;

export const typeLabel = (t: string) => DOC_LABELS[t as DocType] ?? t;
/** The two kinds of official receipt, and open or closed deeds, as the bot tells them apart. Either kind of OR counts as the OR. */
export const OR_KIND: Record<string, string> = { registration: "Registration OR (big)", last: "Last OR (small)" };
export const DEED_KIND: Record<string, string> = { open: "Open deed", closed: "Closed deed (notarized)" };
export const kindsOf = (dets: Detection[]) => dets.flatMap((d) => [d.orKind ? OR_KIND[d.orKind] : null, d.deedKind ? DEED_KIND[d.deedKind] : null]).filter((x): x is string => !!x);

const DETAIL_ROWS: [keyof Detection, string][] = [
  ["documentNumber", "Document number"], ["plate", "Plate"], ["motorNo", "Motor / engine no."], ["chassisNo", "Chassis no."], ["ownerName", "Registered owner"], ["holderName", "Name on the ID"], ["idType", "ID type"],
  ["sellerName", "Seller"], ["buyerName", "Buyer"], ["secretaryName", "Secretary"], ["representativeName", "Representative"], ["validUntil", "OR valid until"], ["lender", "Bank / lender"],
];

/** The types a person may choose, in the order of the work: IN documents, OUT documents, the extra papers, and "other". */
const TYPE_GROUPS: [string, DocType[]][] = [
  ["IN documents (the papers the car came with)", ["official_receipt", "certificate_of_registration", "owner_id", "deed_owner_to_dealer", "chattel_cancellation", "promissory_note", "secretary_certificate", "secretary_id", "representative_id", "board_resolution", "stencil"]],
  ["OUT documents (after the sale)", ["buyer_id", "deed_to_buyer", "acknowledgement_receipt", "transmittal_receipt"]],
  ["Other papers", ["spa", "ex_oficio_sheriff", "voluntary_documents", "secretary_certificate_jfp", "notarized_undertaking", "sec_document", "deed_closed", "other"]],
];

/**
 * One paper, looked at properly: the whole window. The photo is as large as the window allows (zoom, pinch and double-tap as before) with the other
 * photos of this paper under it; the controls and the details are in a panel beside it (under it on a phone or a narrow window).
 */
export function PaperViewer({ open, onOpenChange, title, description, files, intro, busy, readOnly, onSetTypes, run, runNow }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; files: FileView[]; intro?: React.ReactNode;
  busy: boolean; readOnly: boolean; onSetTypes: (fileId: string, types: string[] | null) => void; run: Run; runNow: Run;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const index = Math.max(0, files.findIndex((f) => f.id === activeId));
  const active = files[index] ?? null;
  const go = (step: number) => { if (files.length > 1) setActiveId(files[(index + step + files.length) % files.length].id); };

  // the arrow keys move between the photos of this paper (not while someone is typing)
  useEffect(() => {
    if (!open || files.length < 2) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => { if (!o) setActiveId(null); onOpenChange(o); }} title={title} description={description} size="full" bodyClassName="p-0 sm:p-0 lg:overflow-hidden">
      <div className="flex min-h-full flex-col lg:h-full lg:min-h-0 lg:flex-row">
        <section aria-label="Preview" className="flex flex-col gap-2 p-3 lg:min-h-0 lg:flex-1 lg:p-4">
          {active && active.readStatus !== "pending" ? (
            <>
              <div className="h-[44dvh] lg:h-auto lg:min-h-0 lg:flex-1"><ImageStage key={active.id} src={`/api/docs/file/${active.id}`} name={active.name} rotation={active.rotation} fill /></div>
              {files.length > 1 && (
                <div className="flex items-center gap-2" role="group" aria-label="Photos of this paper">
                  <Button type="button" size="icon-sm" variant="outline" aria-label="Previous photo" onClick={() => go(-1)}><ChevronLeft /></Button>
                  <ul className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1">
                    {files.map((f) => (
                      <li key={f.id}>
                        <button type="button" onClick={() => setActiveId(f.id)} aria-label={`Show ${f.name}`} aria-current={f.id === active.id} className={`grid size-14 place-items-center overflow-hidden rounded-md border bg-muted ${f.id === active.id ? "ring-2 ring-primary" : "opacity-80 hover:opacity-100"}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/docs/file/${f.id}`} alt="" loading="lazy" className="max-h-14 max-w-14 object-contain" style={f.rotation ? { transform: `rotate(${f.rotation}deg)` } : undefined} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Button type="button" size="icon-sm" variant="outline" aria-label="Next photo" onClick={() => go(1)}><ChevronRight /></Button>
                  <span className="text-xs text-muted-foreground tabular-nums">{index + 1} of {files.length}</span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="min-w-0 flex-1 text-muted-foreground"><span className="block truncate">{active.name}</span><span className="block text-xs">{active.uploadedBy ? <>Uploaded by <b className="font-medium text-foreground">{active.uploadedBy}</b></> : "From the Drive folder"} · {new Date(active.addedAt).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })}</span></span>
                <a href={`/api/docs/file/${active.id}?download=1`} download className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"><Download className="size-4" aria-hidden /> Download</a>
                {active.url && <a href={active.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"><ExternalLink className="size-4" aria-hidden /> Open in Drive</a>}
              </div>
            </>
          ) : (
            <div className="grid min-h-40 flex-1 place-items-center rounded-lg bg-muted p-6 text-center text-sm text-muted-foreground">{files.length === 0 ? "No photo is attached to this paper." : "This photo has not been read yet, so there is no preview."}</div>
          )}
        </section>

        <aside aria-label="Details and controls" className="border-t lg:w-[clamp(22rem,26vw,26rem)] lg:shrink-0 lg:overflow-y-auto lg:border-t-0 lg:border-l">
          <div className="space-y-6 p-4">
            {intro}
            {active && <FileControls key={active.id} f={active} busy={busy} readOnly={readOnly} onSetTypes={(t) => onSetTypes(active.id, t)} run={run} runNow={runNow} />}
          </div>
        </aside>
      </div>
    </ResponsiveDialog>
  );
}

const H = ({ children }: { children: React.ReactNode }) => <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{children}</h3>;

/** What this photo is, the warnings on it, what the bot saw, and the actions: one column of sections. */
function FileControls({ f, busy, readOnly, onSetTypes, run, runNow }: { f: FileView; busy: boolean; readOnly: boolean; onSetTypes: (types: string[] | null) => void; run: Run; runNow: Run }) {
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<string[]>(f.types);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const unread = f.readStatus === "pending";
  return (
    <>
      <section aria-label="What this is">
        <H>What this is</H>
        <div className="flex flex-wrap items-center gap-1.5">
          {unread ? <Pill tone="blue">Not read yet</Pill> : f.readStatus === "failed" ? <Pill tone="red">Could not read</Pill> : f.readStatus === "unreadable" ? <Pill tone="red">Too unclear</Pill>
            : f.types.length === 0 ? <Pill tone="zinc">Nothing recognised</Pill> : f.types.map((t) => <Pill key={t} tone={t === "other" || t.endsWith("unmatched") ? "amber" : "emerald"}>{typeLabel(t)}</Pill>)}
          {kindsOf(f.seen.detections).map((k) => <Pill key={k} tone="blue">{k}</Pill>)}
          {f.manual && <Pill tone="purple">Set by a person</Pill>}
          {f.edited && <Pill tone="purple">Corrected by a person</Pill>}
        </div>
        {f.readError && f.readStatus === "failed" && <p className="mt-2 text-sm text-muted-foreground">{f.readError}</p>}
        {!readOnly && !editing && <Button className="mt-3 w-full sm:w-auto" variant="outline" disabled={busy} onClick={() => { setPicked(f.types.filter((t) => (CHOOSABLE as string[]).includes(t))); setEditing(true); }}>Change what this is</Button>}
        {!readOnly && editing && (
          <div className="mt-3 rounded-lg border">
            <div className="space-y-4 p-3">
              <p className="text-sm font-medium">What is in this photo? Tick more than one if it shows two documents.</p>
              {TYPE_GROUPS.map(([title, types]) => (
                <fieldset key={title} className="space-y-1">
                  <legend className="mb-1 text-xs font-semibold text-muted-foreground">{title}</legend>
                  {types.filter((t) => (CHOOSABLE as string[]).includes(t)).map((t) => (
                    <label key={t} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-muted"><input type="checkbox" className="size-4" checked={picked.includes(t)} onChange={(e) => setPicked(e.target.checked ? [...picked, t] : picked.filter((x) => x !== t))} />{DOC_LABELS[t]}</label>
                  ))}
                </fieldset>
              ))}
            </div>
            <div className="sticky bottom-0 flex flex-wrap gap-2 rounded-b-lg border-t bg-popover p-3">
              <Button disabled={busy || picked.length === 0} onClick={() => { onSetTypes(picked); setEditing(false); }}>Save</Button>
              {f.manual && <Button variant="outline" disabled={busy} onClick={() => { onSetTypes(null); setEditing(false); }}>Go back to what was read</Button>}
              <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </section>

      {(f.flags.length > 0 || f.reviewed.length > 0) && (
        <section aria-label="Warnings">
          <H>Warnings</H>
          <div className="space-y-2">
            {f.flags.map((x) => (
              <div key={x} className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
                <p className="flex items-start gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /><span className="min-w-0 flex-1">{x}</span></p>
                {!readOnly && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => reviewFlagAction(f.id, x, true))}>Checked, it is fine</Button>}
              </div>
            ))}
            {f.reviewed.length > 0 && <p className="text-sm text-muted-foreground">{f.reviewed.length} warning{f.reviewed.length === 1 ? "" : "s"} checked by a person. {!readOnly && <button type="button" className="underline underline-offset-2" disabled={busy} onClick={() => run(async () => { let last = { ok: true, message: "The warnings are back." }; for (const x of f.reviewed) last = await reviewFlagAction(f.id, x, false); return last; })}>Show again</button>}</p>}
          </div>
        </section>
      )}

      {f.readStatus === "done" && <Seen f={f} busy={busy} run={run} readOnly={readOnly} />}

      {!readOnly && (
        <section aria-label="Actions">
          <H>Actions</H>
          <div className="space-y-2">
            {f.readStatus !== "pending" && <Button variant="outline" className="w-full justify-start" disabled={busy} onClick={() => run(() => rescanFileAction(f.id))}>Scan this photo again</Button>}
            {confirmRemove
              ? <div className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-900 dark:bg-red-500/10 dark:text-red-200">
                <p>Take this photo out of the car&apos;s folder? It goes to the Drive trash for 30 days.</p>
                <div className="flex gap-2"><Button size="sm" variant="destructive" disabled={busy} onClick={() => { setConfirmRemove(false); runNow(() => removeFileAction(f.id)); }}>Yes, remove it</Button><Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>Keep it</Button></div></div>
              : <Button variant="ghost" className="w-full justify-start text-red-700 dark:text-red-300" disabled={busy} onClick={() => setConfirmRemove(true)}><Trash2 aria-hidden /> Remove this photo from the folder</Button>}
          </div>
        </section>
      )}
    </>
  );
}

/** "What the bot saw": every document the bot found on this photo, in rows that are easy to read, with how sure it was and what it saw wrong with it. */
function Seen({ f, busy, run, readOnly }: { f: FileView; busy: boolean; run: Run; readOnly: boolean }) {
  const [editing, setEditing] = useState<number | null>(null);
  const dets = f.seen.detections;
  return (
    <section aria-label="What the bot saw">
      <H>What the bot saw{f.rotation ? ` · turned ${f.rotation}°` : ""}</H>
      {dets.length === 0 ? <p className="text-sm text-muted-foreground">The bot did not recognise a document on this photo.</p> : (
        <div className="space-y-3">
          {dets.map((d, i) => (
            <div key={i} className="space-y-3 rounded-lg border p-3">
              <div className="space-y-1.5">
                <p className="font-medium">{typeLabel(d.type)}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="How sure the bot is of the type" aria-valuenow={Math.round(d.confidence * 100)} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-emerald-600" style={{ width: `${Math.round(d.confidence * 100)}%` }} /></div>
                  {Math.round(d.confidence * 100)}% sure of the type
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {d.orKind && <Pill tone="blue">{OR_KIND[d.orKind]}</Pill>}
                  {d.deedKind && <Pill tone="blue">{DEED_KIND[d.deedKind]}</Pill>}
                  {d.copy && <Pill tone={d.copy === "original" ? "emerald" : "amber"}>{d.copy === "original" ? "Original" : "Photocopy"}</Pill>}
                  {d.defects?.length ? d.defects.map((x) => <Pill key={x} tone="red">{x}</Pill>) : <span className="text-xs text-emerald-800 dark:text-emerald-300">No damage seen</span>}
                </div>
              </div>
              {DETAIL_ROWS.some(([k]) => d[k]) && (
                <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                  {DETAIL_ROWS.filter(([k]) => d[k]).map(([k, name]) => <div key={k} className="contents"><dt className="text-muted-foreground">{name}</dt><dd className="font-medium break-words">{String(d[k])}</dd></div>)}
                </dl>
              )}
              {readOnly ? null : editing === i ? <EditReading d={d} busy={busy} onCancel={() => setEditing(null)} onSave={(patch) => { run(() => editReadingAction(f.id, i, patch)); setEditing(null); }} />
                : <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(i)}>Correct what the bot read</Button>}
            </div>
          ))}
        </div>
      )}
      {f.seen.notes && <p className="mt-2 text-sm text-muted-foreground">Bot&apos;s note: {f.seen.notes}</p>}
      <p className="mt-2 text-xs text-muted-foreground">A number or name the bot could not read in full is left blank, never guessed.</p>
    </section>
  );
}

/** Fix a wrong or missing reading by hand. A blank box clears the field; the bot's first reading is kept in the record. */
function EditReading({ d, busy, onSave, onCancel }: { d: Detection; busy: boolean; onSave: (patch: Record<string, unknown>) => void; onCancel: () => void }) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(DETAIL_ROWS.map(([k]) => [k, String(d[k] ?? "")])));
  const [copy, setCopy] = useState<string>(d.copy ?? "");
  const [orKind, setOrKind] = useState<string>(d.orKind ?? "");
  const [deedKind, setDeedKind] = useState<string>(d.deedKind ?? "");
  const [noDamage, setNoDamage] = useState(false);
  const show = DETAIL_ROWS.filter(([k]) => k !== "validUntil" || d.type === "official_receipt");
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <p className="text-sm text-muted-foreground">Type what the paper really says. Leave a box empty if it cannot be read.</p>
      <div className="grid gap-3">
        {show.map(([k, name]) => <label key={k} className="space-y-1 text-sm">{name}{k === "validUntil" ? " (2027-03-31)" : ""}<Input value={v[k]} maxLength={k === "validUntil" ? 10 : 120} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>)}
        {d.type === "official_receipt" && <label className="space-y-1 text-sm">Which official receipt
          <NativeSelect value={orKind} onChange={(e) => setOrKind(e.target.value)}><option value="">Not sure</option><option value="registration">{OR_KIND.registration}</option><option value="last">{OR_KIND.last}</option></NativeSelect></label>}
        {d.type === "deed_of_sale" && <label className="space-y-1 text-sm">Open or closed deed
          <NativeSelect value={deedKind} onChange={(e) => setDeedKind(e.target.value)}><option value="">Not sure</option><option value="open">{DEED_KIND.open}</option><option value="closed">{DEED_KIND.closed}</option></NativeSelect></label>}
        <label className="space-y-1 text-sm">Original or photocopy
          <NativeSelect value={copy} onChange={(e) => setCopy(e.target.value)}><option value="">Not sure</option><option value="original">Original</option><option value="photocopy">Photocopy</option></NativeSelect></label>
      </div>
      {d.defects?.length ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={noDamage} onChange={(e) => setNoDamage(e.target.checked)} /> No damage: clear “{d.defects.join(", ")}”</label> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => onSave({ ...Object.fromEntries(show.map(([k]) => [k, v[k]])), copy: copy || null, ...(d.type === "official_receipt" ? { orKind: orKind || null } : {}), ...(d.type === "deed_of_sale" ? { deedKind: deedKind || null } : {}), ...(noDamage ? { noDamage: true } : {}) })}>Save the correction</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
