"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, ChevronRight, CircleAlert, FolderInput, Loader2, ScanText, X } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Rule } from "@/lib/docs/stage";
import { paperOfType } from "@/lib/docs/transfer-papers";
import { approveOutAction, approveTransferAction, scanStageAction, setFileTypesAction, setStageFileTypeAction, withdrawStageAction } from "../actions";
import { AdminFixButton } from "./admin-fix";
import { PaperViewer } from "./paper-viewer";
import type { FileView } from "./types";
import { useStep } from "./use-step";

export interface StageItem { key: string; label: string; present: boolean; optional?: boolean; files: FileView[] }

const stamp = (iso: string) => new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

export interface StagePanelProps {
  stage: "out" | "transfer";
  title: string;
  /** what this stage is, for the person who has not seen it before */
  intro: string;
  plate: string;
  items: StageItem[];
  /** photos that are on no line of the list yet (waiting for the bot, or it could not tell what they are) */
  loose: FileView[];
  pending: number; failed: number; scanning: boolean; botName: string;
  approval: { at: string; byName: string | null } | null;
  rule: Rule;
  /** the person adds, scans and corrects photos */
  canEdit: boolean;
  /** the person approves (Sales for OUT, Documentation for the transfer; the Admins both) */
  canApprove: boolean;
  isAdmin: boolean;
  /** OUT: the car can be moved to Sold with the approval (its IN documents are approved and it is not in Sold yet) */
  canMoveToSold?: boolean;
  /** the uploader of this stage, made by the page */
  uploader: React.ReactNode;
}

/**
 * The same panel for the OUT documents and for the papers back from the transfer, built like the IN documents: upload, scan by the stage's own bot, a checklist
 * the bot fills in, a person who reviews each paper in the same viewer (the photo, what the bot saw, what can be changed), and one approval.
 */
export function StagePanel(p: StagePanelProps) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const { busy: stepBusy, step, dialog } = useStep();
  const [open, setOpen] = useState<string | null>(null); // an item's key, or "file:<id>"
  const have = p.items.filter((i) => i.present && !i.optional).length, needed = p.items.filter((i) => !i.optional).length;
  const unchecked = p.scanning || p.pending > 0;
  const label = p.scanning ? "The bot is reading…" : p.pending ? `Scan ${p.pending} photo${p.pending === 1 ? "" : "s"}` : p.failed ? `Scan ${p.failed} again` : "All scanned";
  const total = p.items.reduce((n, i) => n + i.files.length, 0) + p.loose.length;
  const locked = !!p.approval && !p.isAdmin; // an approved stage is changed by an Admin only
  const readOnly = !p.canEdit || locked;
  const runNow = (fn: () => Promise<{ ok: boolean; message: string }>) => start(async () => { const r = await fn(); if (r.ok) toast.success(r.message); else toast.error(r.message); router.refresh(); });
  const scan = () => runNow(() => scanStageAction(p.plate, p.stage));
  const approve = (moveToo: boolean) => step(moveToo ? "Approve and move to Sold with things still open?" : "Approve with things still open?", (c) => (p.stage === "out" ? approveOutAction(p.plate, c, moveToo) : approveTransferAction(p.plate, c)));

  const byId = new Map([...p.items.flatMap((i) => i.files), ...p.loose].map((f) => [f.id, f]));
  const selectedItem = open && !open.startsWith("file:") ? p.items.find((i) => i.key === open) ?? null : null;
  const selectedFiles = selectedItem ? selectedItem.files : open?.startsWith("file:") ? [byId.get(open.slice(5))].filter((f): f is FileView => !!f) : [];
  // the viewer's "what is this" choice: for OUT it is the document type itself; for the transfer it is the paper (OR, CR, PNP clearance, macro-etching)
  const setTypes = (id: string, types: string[] | null) => runNow(() => {
    if (p.stage === "out") return setFileTypesAction(id, types);
    const paper = types?.map((t) => paperOfType(t)).find(Boolean) ?? "Other";
    return setStageFileTypeAction(id, "transfer", paper);
  });

  const row = (key: string, title: string, present: boolean | null, files: FileView[], state: string) => {
    const warn = files.reduce((n, f) => n + f.flags.length, 0);
    return (
      <li key={key}>
        <button type="button" onClick={() => setOpen(key)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left text-sm hover:bg-muted/50 focus-visible:bg-muted/50">
          <span className={present === null ? "text-muted-foreground" : present ? "text-emerald-700" : unchecked ? "text-muted-foreground" : "text-amber-700"} aria-hidden>{present ? <Check className="size-4" /> : present === null ? <CircleAlert className="size-4" /> : <X className="size-4" />}</span>
          <span className="min-w-[9rem] flex-1 break-words">{title}</span>
          {warn > 0 && <Pill tone="amber">{warn} to check</Pill>}
          <span className="hidden gap-1 sm:flex">{files.slice(0, 2).map((f) => (
            <span key={f.id} className="grid size-7 place-items-center overflow-hidden rounded border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/docs/file/${f.id}`} alt="" loading="lazy" className="max-h-7 max-w-7 object-contain" style={f.rotation ? { transform: `rotate(${f.rotation}deg)` } : undefined} />
            </span>
          ))}</span>
          <span className={present === null ? "text-muted-foreground" : present ? "text-emerald-800 dark:text-emerald-300" : unchecked ? "text-muted-foreground" : "text-amber-800 dark:text-amber-300"}>{state}</span>
          <ChevronRight className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
        </button>
      </li>
    );
  };

  return (
    <Card id={`stage-${p.stage}`}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3">{p.title}
          <span className="text-sm font-normal text-muted-foreground">{unchecked ? "Not final until every photo is read" : `${have} of ${needed} in`}</span>
          {p.approval ? <Pill tone="emerald">Approved</Pill> : <Pill tone="zinc">Not approved yet</Pill>}
          {p.canEdit && total > 0 && !locked && <Button className="ml-auto" size="sm" disabled={busy || p.scanning || (p.pending === 0 && p.failed === 0)} onClick={scan}>{busy || p.scanning ? <Loader2 className="animate-spin" /> : <ScanText />}{label}</Button>}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{p.intro}</p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {p.approval && <p className="font-medium">Approved by {p.approval.byName ?? "someone"} on {stamp(p.approval.at)} (Manila time).</p>}
        {p.canEdit && !locked && p.uploader}
        {p.scanning && <p className="rounded-lg bg-muted p-3 text-muted-foreground" role="status">{p.botName} is reading the photos. They fill into the list by themselves; you do not need to wait here.</p>}
        <ul className="divide-y rounded-lg ring-1 ring-foreground/10" aria-label={p.title}>
          {p.items.map((i) => row(i.key, i.label, i.present, i.files, i.present ? "In" : unchecked ? "Not checked yet" : i.optional ? "Optional" : "Still needed"))}
        </ul>
        {p.loose.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Other photos</p>
            <ul className="divide-y rounded-lg ring-1 ring-foreground/10">{p.loose.map((f) => row(`file:${f.id}`, f.name, null, [f], f.readStatus === "pending" ? "Not read yet" : f.readStatus === "failed" ? "Could not read" : f.readStatus === "unreadable" ? "Too unclear" : "Say what it is"))}</ul>
          </div>
        )}
        {!p.approval && p.canApprove && total > 0 && (
          <div className="space-y-2 border-t pt-3">
            <div className="flex flex-wrap gap-2">
              {p.canMoveToSold && <Button disabled={stepBusy || !p.rule.allowed} onClick={() => approve(true)}>{stepBusy ? <Loader2 className="animate-spin" /> : <FolderInput />} Approve and move to Sold</Button>}
              <Button variant={p.canMoveToSold ? "outline" : "default"} disabled={stepBusy || (!p.rule.allowed && !(p.rule.adminOverride && p.isAdmin))} onClick={() => approve(false)}>{stepBusy ? <Loader2 className="animate-spin" /> : <BadgeCheck />} {p.canMoveToSold ? "Approve only" : "Approve: all in order"}</Button>
            </div>
            {!p.rule.allowed && p.rule.reason && <p className="text-xs text-muted-foreground">{p.rule.reason}{p.rule.adminOverride && !p.isAdmin ? " Only an Admin can approve before then." : ""}</p>}
            {p.canMoveToSold && p.rule.allowed && <p className="text-xs text-muted-foreground">All three papers are in and the IN documents are approved: you can approve and move the car to Sold in one go.</p>}
          </div>
        )}
        {p.approval && p.isAdmin && <AdminFixButton plate={p.plate} fix={{ kind: "approval" }} label="Withdraw the approval (Admin)" title="Withdraw the approval?" warning="The stage goes back to Not approved, so a mistake can be corrected and approved again." confirmLabel="Yes, withdraw it" run={() => withdrawStageAction(p.plate, p.stage)} />}
        {dialog}
      </CardContent>
      <PaperViewer
        open={open !== null && (selectedItem !== null || selectedFiles.length > 0)} onOpenChange={(o) => !o && setOpen(null)}
        title={selectedItem ? selectedItem.label : selectedFiles[0]?.name ?? ""}
        description={selectedItem ? (selectedItem.present ? "The photo of this paper, what the bot read, and what you can change." : "This paper is not in the list yet.") : "The photo and what the bot read."}
        files={selectedFiles} busy={busy || p.scanning} readOnly={readOnly} run={runNow} runNow={runNow} onSetTypes={setTypes}
        intro={selectedItem && !selectedItem.present && !readOnly ? <p className="text-sm text-muted-foreground">Add a photo of it with the box above, or, if it is in the list under another paper, change that photo from <b>Other photos</b>.</p> : undefined}
      />
    </Card>
  );
}
