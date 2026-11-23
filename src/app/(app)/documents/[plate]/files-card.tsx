"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Download, Loader2, Minus, RefreshCw, ScanText, X } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import type { Rules } from "@/lib/docs/stage";
import { CASE_LABELS, CHOOSABLE_CASES } from "@/lib/docs/types";
import { saveCellAction } from "../../docs-bible/actions";
import { PaperViewer, typeLabel } from "./paper-viewer";
import { UploadButton } from "./upload-button";
import { useEditConfirm } from "./edit-confirm";
import { readNextAction, rescanAction, setCaseAction, setFileTypesAction, updateRegisterAction } from "../actions";
import type { CarViewData, FileView } from "./types";


const SLOT_COLUMN: Record<string, string> = { official_receipt: "or_receipt", certificate_of_registration: "cr", deed_owner_to_dealer: "deed", owner_id: "sellers_id", representative_id: "sellers_id", chattel_cancellation: "chattel", promissory_note: "promissory", secretary_certificate: "sec_cert", secretary_id: "sec_ids", board_resolution: "boards_reso", stencil: "stencil" };
const REG_CHOICES = ["Yes", "No", "To follow", "N/A"] as const;
const REG_CHIP: Record<string, string> = { "Yes": "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200", "No": "bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-200", "To follow": "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200", "N/A": "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-300" };

/**
 * The one part that answers "what papers does this car have?": each paper the case needs, whether it is in the folder, a small picture, and a
 * warning if something needs a look. Click a paper to see its photos large, what the bot read, and to correct it. What a person corrects shows
 * here at once, and Car documents says the same thing (or says it differs and offers to update it).
 */
export function PapersCard({ data, rules, readOnly = false, confirmEdits = false, register, canEditRegister, differs }: { confirmEdits?: boolean; data: CarViewData; rules: Rules; readOnly?: boolean; register: { id: string; values: Record<string, string | null> } | null; canEditRegister: boolean; differs: number | null }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [reading, setReading] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null); // a paper's key, or "file:<id>"
  const { confirm, dialog: confirmDialog } = useEditConfirm(confirmEdits);
  const runNow = (fn: () => Promise<{ ok: boolean; message: string }>) => start(async () => { const r = await fn(); if (r.ok) toast.success(r.message); else toast.error(r.message); router.refresh(); });
  /** A change to a car that is already in Sold asks an Admin first; the buttons that ask on their own use runNow. */
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) => confirm(() => runNow(fn));

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
  const flagCount = (ids: string[]) => ids.reduce((n, id) => n + (byId.get(id)?.flags.length ?? 0), 0);
  // the IN documents only: the after-sale papers are on the OUT documents tab (one with a warning still shows here, so Buying can settle it)
  const outWarned = data.items.filter((i) => i.stage === "sold" && flagCount(i.fileIds) > 0);
  const groups = [["Papers the car came with", data.items.filter((i) => i.stage === "available")], ...(outWarned.length ? [["OUT documents with a warning", outWarned] as const] : [])] as const;
  const selectedItem = open && !open.startsWith("file:") ? data.items.find((i) => i.key === open) ?? null : null;
  const selectedFiles = selectedItem ? selectedItem.fileIds.map((id) => byId.get(id)).filter((f): f is FileView => !!f) : open?.startsWith("file:") ? [byId.get(open.slice(5))].filter((f): f is FileView => !!f) : [];
  const col = selectedItem ? SLOT_COLUMN[selectedItem.key] : undefined;
  const regValue = col && register ? register.values[col] ?? null : null;

  const row = (key: string, title: string, present: boolean | null, fileIds: string[], state: string) => {
    const warn = flagCount(fileIds);
    return (
      <li key={key}>
        <button type="button" onClick={() => setOpen(key)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left text-sm hover:bg-muted/50 focus-visible:bg-muted/50">
          <span className={present === null ? "text-muted-foreground" : present ? "text-emerald-700" : unchecked ? "text-muted-foreground" : "text-amber-700"} aria-hidden>{present ? <Check className="size-4" /> : unchecked && !present ? <Minus className="size-4" /> : <X className="size-4" />}</span>
          <span className="min-w-[9rem] flex-1 break-words">{title}</span>
          {warn > 0 && <Pill tone="amber">{warn} to check</Pill>}
          <span className="hidden gap-1 sm:flex">{fileIds.slice(0, 2).map((id) => (
            <span key={id} className="grid size-7 place-items-center overflow-hidden rounded border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/docs/file/${id}`} alt="" loading="lazy" className="max-h-7 max-w-7 object-contain" style={byId.get(id)?.rotation ? { transform: `rotate(${byId.get(id)!.rotation}deg)` } : undefined} />
            </span>
          ))}</span>
          <span className={present === null ? "text-muted-foreground" : present ? "text-emerald-800 dark:text-emerald-300" : unchecked ? "text-muted-foreground" : "text-amber-800 dark:text-amber-300"}>{state}</span>
          <ChevronRight className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
        </button>
      </li>
    );
  };

  return (
    <Card id="papers">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3">IN documents
          <span className="text-sm font-normal text-muted-foreground">{!data.scanned ? "Looking at the folder…" : unchecked ? "Not final until every photo is scanned" : `${inFolder} of ${needed} in the folder`}</span>
          <span className="ml-auto flex flex-wrap gap-2">
          {data.files.length > 0 && <DownloadAll files={data.files.map((f) => ({ id: f.id }))} />}
          {!readOnly && <>
            <UploadButton plate={data.plate} botScans={data.botMode} />
            <Button size="sm" variant="outline" disabled={busy || !!reading || data.scanning} onClick={() => run(() => rescanAction(data.plate))}><RefreshCw /> Look for new files</Button>
            <Button size="sm" disabled={busy || !!reading || !rules.scan.allowed} onClick={() => scan(data.pending === 0)}>{reading || data.scanning ? <Loader2 className="animate-spin" /> : <ScanText />}{label}</Button>
          </>}
          </span>
        </CardTitle>
        {data.lastScan && !data.scanning && <p className="text-xs text-muted-foreground" role="status">Last scan: {new Date(data.lastScan.at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })} · {data.lastScan.photos} {data.lastScan.photos === 1 ? "photo" : "photos"} · {data.lastScan.ok ? `finished${data.lastScan.seconds !== null ? ` in ${data.lastScan.seconds >= 60 ? `${Math.floor(data.lastScan.seconds / 60)} min ${data.lastScan.seconds % 60} s` : `${data.lastScan.seconds} s`}` : ""}` : `failed${data.lastScan.error ? `: ${data.lastScan.error}` : ""}`}</p>}
        {!readOnly && !rules.scan.allowed && rules.scan.reason && data.files.length > 0 && <p className="text-xs text-muted-foreground">{rules.scan.reason}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`flex flex-col gap-3 rounded-lg p-3 text-sm sm:flex-row sm:flex-wrap sm:items-center ${chosen ? "bg-muted" : "bg-amber-50 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100"}`}>
          <label className="flex items-center gap-2 font-medium">Case
            <NativeSelect aria-label="Case" className="w-full sm:w-44" value={chosen ? data.caseType : ""} disabled={busy || readOnly} onChange={(e) => choose(e.target.value)}>
              {!chosen && <option value="" disabled>Choose the case…</option>}
              {(chosen && !CHOOSABLE_CASES.includes(data.caseType) ? [data.caseType, ...CHOOSABLE_CASES] : CHOOSABLE_CASES).map((c) => <option key={c} value={c}>{CASE_LABELS[c]}</option>)}
            </NativeSelect></label>
          <p className="min-w-0 text-xs sm:flex-1">{data.scanned && data.pending === 0 ? <>The bot suggests <b>{CASE_LABELS[data.suggestedCase]}</b>: {data.caseReason}</> : "The bot suggests a case after the scan."}{!chosen && " A person chooses the case before approving."}</p>
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
            {differs === 0 ? "The car record says the same as this checklist." : `The car record differs from this checklist for ${differs} ${differs === 1 ? "paper" : "papers"}.`}
            {differs > 0 && <Button size="xs" variant="outline" disabled={busy || !chosen} onClick={() => run(() => updateRegisterAction(data.plate))}>Update the car record</Button>}
            {differs > 0 && !chosen && <span>(choose the case first)</span>}
          </p>
        )}
      </CardContent>

      <PaperViewer
        open={open !== null && (selectedItem !== null || selectedFiles.length > 0)} onOpenChange={(o) => !o && setOpen(null)}
        title={selectedItem ? selectedItem.label : selectedFiles[0]?.name ?? ""}
        description={selectedItem ? (selectedItem.present ? "The photo of this paper, what the bot read, and what you can change." : "This paper is not in the folder yet.") : "The photo and what the bot read."}
        files={selectedFiles} busy={busy || data.scanning} readOnly={readOnly} run={run} runNow={runNow}
        onSetTypes={(id, types) => run(() => setFileTypesAction(id, types))}
        intro={<>
          {selectedItem && !selectedItem.present && !readOnly && <p className="text-sm text-muted-foreground">Add a photo of it with <b>Upload documents</b> at the top of the Papers card, or, if it is in the folder under another type, change that photo&apos;s type from the list <b>Other photos</b>.</p>}
          {register && col && (
            <div className="space-y-2 rounded-lg bg-muted p-3 text-sm">
              <p className="font-medium">Car documents says</p>
              {canEditRegister
                ? <NativeSelect aria-label={`Car record: ${selectedItem?.label}`} value={regValue ?? ""} disabled={busy} onChange={(e) => run(async () => { const r = await saveCellAction(register.id, col, e.target.value, regValue); return { ok: r.ok, message: r.ok ? "Saved in MAD." : r.message ?? "Could not save." }; })}><option value="">(empty)</option>{REG_CHOICES.map((c) => <option key={c} value={c}>{c}</option>)}</NativeSelect>
                : <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${regValue ? REG_CHIP[regValue] : ""}`}>{regValue ?? "(empty)"}</span>}
              {canEditRegister && <p className="text-xs text-muted-foreground">Use To follow or N/A when the paper is not coming or not needed.</p>}
            </div>
          )}
          {selectedFiles.length === 0 && selectedItem?.present && <p className="text-sm text-muted-foreground">No photo is attached to this paper.</p>}
        </>}
      />
      {confirmDialog}
    </Card>
  );
}

/** Saves every photo of the car, one after the other (the browser may ask once to allow several downloads). */
function DownloadAll({ files }: { files: { id: string }[] }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    for (const f of files) {
      const a = document.createElement("a");
      a.href = `/api/docs/file/${f.id}?download=1`; a.download = ""; document.body.appendChild(a); a.click(); a.remove();
      await new Promise((r) => setTimeout(r, 600));
    }
    setBusy(false);
  };
  return <Button size="sm" variant="outline" disabled={busy} onClick={() => void run()}>{busy ? <Loader2 className="animate-spin" /> : <Download />} Download photos ({files.length})</Button>;
}
