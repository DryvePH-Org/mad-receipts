"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, CircleAlert, Loader2, Minus, RefreshCw, ScanText, X } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { Rules } from "@/lib/docs/stage";
import { CASE_LABELS, CASES, CHOOSABLE, DOC_LABELS, type Detection, type DocType } from "@/lib/docs/types";
import { saveCellAction } from "../../docs-bible/actions";
import { UploadButton } from "./upload-button";
import { rescanFileAction, editReadingAction, readNextAction, reviewFlagAction, rescanAction, setCaseAction, setFileTypesAction, updateRegisterAction } from "../actions";
import type { CarViewData, FileView } from "./types";

const typeLabel = (t: string) => DOC_LABELS[t as DocType] ?? t;

const SLOT_COLUMN: Record<string, string> = { official_receipt: "or_receipt", certificate_of_registration: "cr", deed_owner_to_dealer: "deed", owner_id: "sellers_id", representative_id: "sellers_id", chattel_cancellation: "chattel", promissory_note: "promissory", secretary_certificate: "sec_cert", secretary_id: "sec_ids", board_resolution: "boards_reso", stencil: "stencil" };
const REG_CHOICES = ["Yes", "No", "To follow", "N/A"] as const;
const REG_CHIP: Record<string, string> = { "Yes": "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200", "No": "bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-200", "To follow": "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200", "N/A": "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-300" };

/**
 * The one part that answers "what papers does this car have?": each paper the case needs, whether it is in the folder, a small picture, and a
 * warning if something needs a look. Click a paper to see its photos large, what the bot read, and to correct it. What a person corrects shows
 * here at once, and the Docs Bible says the same thing (or says it differs and offers to update it).
 */
export function PapersCard({ data, rules, readOnly = false, register, canEditRegister, differs }: { data: CarViewData; rules: Rules; readOnly?: boolean; register: { id: string; values: Record<string, string | null> } | null; canEditRegister: boolean; differs: number | null }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [reading, setReading] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null); // a paper's key, or "file:<id>"
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

  const chosen = data.caseSource === "manual";
  const choose = (value: string) => run(() => setCaseAction(data.plate, value));
  const byId = new Map(data.files.map((f) => [f.id, f]));
  const used = new Set(data.items.flatMap((i) => i.fileIds));
  const others = data.files.filter((f) => !used.has(f.id));
  const inFolder = data.items.filter((i) => i.stage === "available" && !i.optional && i.present).length, needed = data.items.filter((i) => i.stage === "available" && !i.optional).length;
  const unchecked = !data.scanned || data.pending > 0 || data.scanning;
  const label = data.scanning ? "The bot is scanning…" : reading ?? (data.pending ? `${data.botMode ? "Scan" : "Read"} ${data.pending} photo${data.pending === 1 ? "" : "s"}` : data.failed ? `Scan ${data.failed} again` : "All scanned");
  const groups = [["Before the sale", data.items.filter((i) => i.stage === "available")], ["After the sale", data.items.filter((i) => i.stage === "sold")]] as const;
  const selectedItem = open && !open.startsWith("file:") ? data.items.find((i) => i.key === open) ?? null : null;
  const selectedFiles = selectedItem ? selectedItem.fileIds.map((id) => byId.get(id)).filter((f): f is FileView => !!f) : open?.startsWith("file:") ? [byId.get(open.slice(5))].filter((f): f is FileView => !!f) : [];
  const col = selectedItem ? SLOT_COLUMN[selectedItem.key] : undefined;
  const regValue = col && register ? register.values[col] ?? null : null;
  const flagCount = (ids: string[]) => ids.reduce((n, id) => n + (byId.get(id)?.flags.length ?? 0), 0);

  const row = (key: string, title: string, present: boolean | null, fileIds: string[], state: string) => {
    const warn = flagCount(fileIds);
    return (
      <li key={key}>
        <button type="button" onClick={() => setOpen(key)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/50 focus-visible:bg-muted/50">
          <span className={present === null ? "text-muted-foreground" : present ? "text-emerald-700" : unchecked ? "text-muted-foreground" : "text-amber-700"} aria-hidden>{present ? <Check className="size-4" /> : unchecked && !present ? <Minus className="size-4" /> : <X className="size-4" />}</span>
          <span className="min-w-0 flex-1 truncate">{title}</span>
          {warn > 0 && <Pill tone="amber">{warn} to check</Pill>}
          <span className="hidden gap-1 sm:flex">{fileIds.slice(0, 2).map((id) => (
            <span key={id} className="grid size-7 place-items-center overflow-hidden rounded border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/docs/file/${id}`} alt="" loading="lazy" className="max-h-7 max-w-7 object-contain" style={byId.get(id)?.rotation ? { transform: `rotate(${byId.get(id)!.rotation}deg)` } : undefined} />
            </span>
          ))}</span>
          <span className={present === null ? "text-muted-foreground" : present ? "text-emerald-800 dark:text-emerald-300" : unchecked ? "text-muted-foreground" : "text-amber-800 dark:text-amber-300"}>{state}</span>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </button>
      </li>
    );
  };

  return (
    <Card id="papers">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3">Papers
          <span className="text-sm font-normal text-muted-foreground">{!data.scanned ? "Looking at the folder…" : unchecked ? "Not final until every photo is scanned" : `${inFolder} of ${needed} in the folder`}</span>
          {!readOnly && <span className="ml-auto flex flex-wrap gap-2">
            <UploadButton plate={data.plate} botScans={data.botMode} />
            <Button size="sm" variant="outline" disabled={busy || !!reading || data.scanning} onClick={() => run(() => rescanAction(data.plate))}><RefreshCw /> Look for new files</Button>
            <Button size="sm" disabled={busy || !!reading || !rules.scan.allowed} onClick={() => scan(data.pending === 0)}>{reading || data.scanning ? <Loader2 className="animate-spin" /> : <ScanText />}{label}</Button>
          </span>}
        </CardTitle>
        {data.lastScan && !data.scanning && <p className="text-xs text-muted-foreground" role="status">Last scan: {new Date(data.lastScan.at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })} · {data.lastScan.photos} {data.lastScan.photos === 1 ? "photo" : "photos"} · {data.lastScan.ok ? `finished${data.lastScan.seconds !== null ? ` in ${data.lastScan.seconds >= 60 ? `${Math.floor(data.lastScan.seconds / 60)} min ${data.lastScan.seconds % 60} s` : `${data.lastScan.seconds} s`}` : ""}` : `failed${data.lastScan.error ? `: ${data.lastScan.error}` : ""}`}</p>}
        {!readOnly && !rules.scan.allowed && rules.scan.reason && data.files.length > 0 && <p className="text-xs text-muted-foreground">{rules.scan.reason}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`flex flex-wrap items-center gap-3 rounded-lg p-3 text-sm ${chosen ? "bg-muted" : "bg-amber-50 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100"}`}>
          <label className="flex items-center gap-2 font-medium">Case
            <NativeSelect aria-label="Case" className="w-44" value={chosen ? data.caseType : ""} disabled={busy || readOnly} onChange={(e) => choose(e.target.value)}>
              {!chosen && <option value="" disabled>Choose the case…</option>}
              {CASES.map((c) => <option key={c} value={c}>{CASE_LABELS[c]}</option>)}
            </NativeSelect></label>
          <p className="min-w-0 flex-1 text-xs">{data.scanned && data.pending === 0 ? <>The bot suggests <b>{CASE_LABELS[data.suggestedCase]}</b>: {data.caseReason}</> : "The bot suggests a case after the scan."}{!chosen && " A person chooses the case before approving."}</p>
          {!readOnly && data.scanned && data.pending === 0 && (!chosen || data.caseType !== data.suggestedCase) && <Button size="sm" variant="outline" disabled={busy} onClick={() => choose(data.suggestedCase)}>Use {CASE_LABELS[data.suggestedCase]}</Button>}
        </div>
        {data.files.length === 0 && data.items.length === 0 ? <p className="text-sm text-muted-foreground">{data.scanned ? <>No photos in this folder yet. Use <b>Add documents</b>.</> : "Looking at the folder…"}</p> : (
          <>
            {groups.map(([title, list]) => list.length > 0 && (
              <div key={title} className="space-y-1.5">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
                <ul className="divide-y rounded-lg ring-1 ring-foreground/10">{list.map((i) => row(i.key, i.label, i.present, i.fileIds, i.present ? "In the folder" : unchecked ? "Not checked yet" : i.optional ? "Optional" : "Missing"))}</ul>
              </div>
            ))}
            {others.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Other photos</p>
                <ul className="divide-y rounded-lg ring-1 ring-foreground/10">{others.map((f) => row(`file:${f.id}`, f.name, null, [f.id], f.readStatus === "pending" ? "Not read yet" : f.readStatus === "failed" ? "Could not read" : f.readStatus === "unreadable" ? "Too unclear" : f.types.length === 0 ? "Nothing recognised" : f.types.map(typeLabel).join(", ")))}</ul>
              </div>
            )}
          </>
        )}
        {register && !readOnly && differs !== null && (
          <p className="flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
            {differs === 0 ? "The Docs Bible row says the same as this checklist." : `The Docs Bible row differs from this checklist for ${differs} ${differs === 1 ? "paper" : "papers"}.`}
            {differs > 0 && <Button size="xs" variant="outline" disabled={busy || !chosen} onClick={() => run(() => updateRegisterAction(data.plate))}>Update the Docs Bible</Button>}
            {differs > 0 && !chosen && <span>(choose the case first)</span>}
          </p>
        )}
      </CardContent>

      <ResponsiveDialog open={open !== null && (selectedItem !== null || selectedFiles.length > 0)} onOpenChange={(o) => !o && setOpen(null)} title={selectedItem ? selectedItem.label : selectedFiles[0]?.name ?? ""} description={selectedItem ? (selectedItem.present ? "The photos that show this paper, what the bot read, and what you can correct." : "This paper is not in the folder yet.") : "What the bot read from this photo."}>
        <div className="max-h-[75svh] space-y-4 overflow-auto pr-1">
          {selectedItem && !selectedItem.present && !readOnly && <p className="text-sm text-muted-foreground">Add a photo of it with <b>Upload documents</b> at the top of this card, or, if it is in the folder under another type, change that photo&apos;s type from the list <b>Other photos</b>.</p>}
          {register && col && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-3 text-sm">
              <span className="font-medium">Docs Bible says</span>
              {canEditRegister
                ? <NativeSelect aria-label={`Docs Bible: ${selectedItem?.label}`} className="w-36" value={regValue ?? ""} disabled={busy} onChange={(e) => run(async () => { const r = await saveCellAction(register.id, col, e.target.value, regValue); return { ok: r.ok, message: r.ok ? "Saved in the Docs Bible." : r.message ?? "Could not save." }; })}><option value="">(empty)</option>{REG_CHOICES.map((c) => <option key={c} value={c}>{c}</option>)}</NativeSelect>
                : <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${regValue ? REG_CHIP[regValue] : ""}`}>{regValue ?? "(empty)"}</span>}
              <span className="text-xs text-muted-foreground">{canEditRegister ? "Use To follow or N/A when the paper is not coming or not needed." : ""}</span>
            </div>
          )}
          {selectedFiles.length === 0 && selectedItem?.present && <p className="text-sm text-muted-foreground">No photo is attached to this paper.</p>}
          <ul className="divide-y">{selectedFiles.map((f) => <FileRow key={f.id} f={f} busy={busy || data.scanning} onSave={(types) => run(() => setFileTypesAction(f.id, types))} run={run} readOnly={readOnly} />)}</ul>
        </div>
      </ResponsiveDialog>
    </Card>
  );
}

function FileRow({ f, busy, onSave, run, readOnly }: { f: FileView; busy: boolean; onSave: (types: string[] | null) => void; run: (fn: () => Promise<{ ok: boolean; message: string }>) => void; readOnly: boolean }) {
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
          {f.edited && <Pill tone="purple">Corrected by a person</Pill>}
        </span>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        {f.readStatus === "done" && <Thumb id={f.id} name={f.name} rotation={f.rotation} />}
        <div className="min-w-0 flex-1 space-y-2">
          {f.flags.map((x) => (
            <div key={x} className="flex flex-wrap items-start gap-2 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /><span className="min-w-0 flex-1">{x}</span>
              {!readOnly && <Button size="xs" variant="outline" disabled={busy} onClick={() => run(() => reviewFlagAction(f.id, x, true))}>Checked, it is fine</Button>}
            </div>
          ))}
          {f.reviewed.length > 0 && <p className="text-xs text-muted-foreground">{f.reviewed.length} warning{f.reviewed.length === 1 ? "" : "s"} checked by a person. {!readOnly && <button type="button" className="underline underline-offset-2" disabled={busy} onClick={() => run(async () => { let last = { ok: true, message: "The warnings are back." }; for (const x of f.reviewed) last = await reviewFlagAction(f.id, x, false); return last; })}>Show again</button>}</p>}
          {f.readError && f.readStatus === "failed" && <p className="text-xs text-muted-foreground">{f.readError}</p>}
          {f.readStatus === "done" && <Seen f={f} busy={busy} run={run} readOnly={readOnly} />}
        </div>
      </div>
      {readOnly ? null : editing ? (
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
      ) : <div className="flex flex-wrap gap-3"><button type="button" className="text-xs underline underline-offset-2 disabled:opacity-50" disabled={busy} onClick={() => { setPicked(f.types.filter((t) => (CHOOSABLE as string[]).includes(t))); setEditing(true); }}>Change what this is</button>
        {f.readStatus !== "pending" && <button type="button" className="text-xs underline underline-offset-2 disabled:opacity-50" disabled={busy} onClick={() => run(() => rescanFileAction(f.id))}>Scan this photo again</button>}</div>}
    </li>
  );
}

const DETAIL_ROWS: [keyof Detection, string][] = [
  ["documentNumber", "Document number"], ["plate", "Plate"], ["motorNo", "Motor / engine no."], ["chassisNo", "Chassis no."], ["ownerName", "Registered owner"], ["holderName", "Name on the ID"], ["idType", "ID type"],
  ["sellerName", "Seller"], ["buyerName", "Buyer"], ["secretaryName", "Secretary"], ["representativeName", "Representative"], ["validUntil", "OR valid until"], ["lender", "Bank / lender"],
];

/** "What the bot saw": every document the bot found on this photo with what it read, how sure it was, and what it saw wrong with it. */
function Seen({ f, busy, run, readOnly }: { f: FileView; busy: boolean; run: (fn: () => Promise<{ ok: boolean; message: string }>) => void; readOnly: boolean }) {
  const [editing, setEditing] = useState<number | null>(null);
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
            {readOnly ? null : editing === i ? <EditReading d={d} busy={busy} onCancel={() => setEditing(null)} onSave={(patch) => { run(() => editReadingAction(f.id, i, patch)); setEditing(null); }} />
              : <button type="button" className="text-xs underline underline-offset-2 disabled:opacity-50" disabled={busy} onClick={() => setEditing(i)}>Correct what the bot read</button>}
          </div>
        ))}
        {f.seen.notes && <p className="text-xs text-muted-foreground">Bot&apos;s note: {f.seen.notes}</p>}
        <p className="text-xs text-muted-foreground">A number or name the bot could not read in full is left blank, never guessed.</p>
      </div>
    </details>
  );
}

/** Fix a wrong or missing reading by hand. A blank box clears the field; the bot's first reading is kept in the record. */
function EditReading({ d, busy, onSave, onCancel }: { d: Detection; busy: boolean; onSave: (patch: Record<string, unknown>) => void; onCancel: () => void }) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(DETAIL_ROWS.map(([k]) => [k, String(d[k] ?? "")])));
  const [copy, setCopy] = useState<string>(d.copy ?? "");
  const [noDamage, setNoDamage] = useState(false);
  const show = DETAIL_ROWS.filter(([k]) => k !== "validUntil" || d.type === "official_receipt");
  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">Type what the paper really says. Leave a box empty if it cannot be read.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {show.map(([k, name]) => <label key={k} className="space-y-1 text-xs">{name}{k === "validUntil" ? " (2027-03-31)" : ""}<Input value={v[k]} maxLength={k === "validUntil" ? 10 : 120} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>)}
        <label className="space-y-1 text-xs">Original or photocopy
          <NativeSelect value={copy} onChange={(e) => setCopy(e.target.value)}><option value="">Not sure</option><option value="original">Original</option><option value="photocopy">Photocopy</option></NativeSelect></label>
      </div>
      {d.defects?.length ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={noDamage} onChange={(e) => setNoDamage(e.target.checked)} /> No damage: clear “{d.defects.join(", ")}”</label> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => onSave({ ...Object.fromEntries(show.map(([k]) => [k, v[k]])), copy: copy || null, ...(noDamage ? { noDamage: true } : {}) })}>Save the correction</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
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
