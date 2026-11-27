"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, ChevronRight, CircleAlert, Download, FolderInput, Loader2, ScanText, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Pill } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import type { Rule } from "@/lib/docs/stage";
import { approveOutAction, approveTransferAction, removeStageFileAction, scanStageAction, setStageFileTypeAction, withdrawStageAction } from "../actions";
import { AdminFixButton } from "./admin-fix";
import { useStep } from "./use-step";

export interface StageFile { id: string; name: string; readStatus: string; flags: string[]; by: string | null; at: string; types: string[] }
export interface StageItem { key: string; label: string; present: boolean; optional?: boolean; files: StageFile[] }

const stamp = (iso: string) => new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

const OUT_CHOICES = [{ value: "buyer_id", label: "Buyer's ID" }, { value: "deed_to_buyer", label: "Deed signed with the buyer" }, { value: "acknowledgement_receipt", label: "AR (physical copy)" }, { value: "other", label: "None of these" }];
const TRANSFER_CHOICES = ["OR", "CR", "PNP clearance", "Macro-etching", "Other"].map((v) => ({ value: v, label: v }));

export interface StagePanelProps {
  stage: "out" | "transfer";
  title: string;
  /** what this stage is, for the person who has not seen it before */
  intro: string;
  plate: string;
  items: StageItem[];
  /** photos that are on no line of the list (the bot could not tell what they are) */
  loose: StageFile[];
  pending: number; failed: number; scanning: boolean; botName: string;
  approval: { at: string; byName: string | null } | null;
  rule: Rule;
  /** the person adds, scans and removes photos */
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
 * the bot fills in, a person who reviews (changes what a photo is, removes a wrong one), and one approval.
 */
export function StagePanel(p: StagePanelProps) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const { busy: stepBusy, step, dialog } = useStep();
  const [open, setOpen] = useState<string | null>(null);
  const choices = p.stage === "out" ? OUT_CHOICES : TRANSFER_CHOICES;
  const have = p.items.filter((i) => i.present && !i.optional).length, needed = p.items.filter((i) => !i.optional).length;
  const unchecked = p.scanning || p.pending > 0;
  const label = p.scanning ? "The bot is reading…" : p.pending ? `Scan ${p.pending} photo${p.pending === 1 ? "" : "s"}` : p.failed ? `Scan ${p.failed} again` : "All scanned";
  const total = p.items.reduce((n, i) => n + i.files.length, 0) + p.loose.length;
  const scan = () => start(async () => { const r = await scanStageAction(p.plate, p.stage); if (r.ok) toast.success(r.message); else toast.error(r.message); router.refresh(); });
  const change = (fileId: string, value: string) => start(async () => { const r = await setStageFileTypeAction(fileId, p.stage, value); if (r.ok) toast.success(r.message); else toast.error(r.message); router.refresh(); });
  const remove = (fileId: string) => start(async () => { const r = await removeStageFileAction(fileId, p.stage); if (r.ok) toast.success(r.message); else toast.error(r.message); router.refresh(); });
  const approve = (moveToo: boolean) => step(moveToo ? "Approve and move to Sold with things still open?" : "Approve with things still open?", (c) => (p.stage === "out" ? approveOutAction(p.plate, c, moveToo) : approveTransferAction(p.plate, c)));
  const locked = !!p.approval && !p.isAdmin; // an approved stage is changed by an Admin only

  const fileRow = (f: StageFile) => (
    <div key={f.id} className="flex flex-wrap items-start gap-3 pl-1 pt-2 text-xs">
      <a href={`/api/docs/file/${f.id}`} target="_blank" rel="noreferrer" aria-label={`Open ${f.name}`} className="block size-14 shrink-0 overflow-hidden rounded bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/docs/file/${f.id}`} alt="" loading="lazy" className="size-14 object-cover" />
      </a>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate">{f.name}</p>
        <p className="text-muted-foreground">{f.by ? `Added by ${f.by}` : "Added"} · {stamp(f.at)}{f.readStatus === "pending" ? " · waiting for the bot" : f.readStatus === "failed" ? " · could not be read" : f.readStatus === "unreadable" ? " · too unclear to read" : ""}</p>
        {f.flags.map((x) => <p key={x} className="flex gap-1.5 text-amber-800 dark:text-amber-300"><CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />{x}</p>)}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {p.canEdit && !locked && <NativeSelect aria-label={`What is ${f.name}`} className="h-8 w-48 text-xs" disabled={busy} value="" onChange={(e) => { if (e.target.value) change(f.id, e.target.value); }}><option value="">Change what this is…</option>{choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</NativeSelect>}
        <a href={`/api/docs/file/${f.id}?download=1`} download className="inline-flex h-8 items-center gap-1 rounded-lg border px-2 hover:bg-muted"><Download className="size-3.5" aria-hidden /> Download</a>
        {p.canEdit && !locked && <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${f.name}`} disabled={busy} onClick={() => remove(f.id)}><Trash2 /></Button>}
      </div>
    </div>
  );

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
          {p.items.map((i) => {
            const warn = i.files.reduce((n, f) => n + f.flags.length, 0);
            const isOpen = open === i.key;
            return (
              <li key={i.key}>
                <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : i.key)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left hover:bg-muted/50">
                  <span className={i.present ? "text-emerald-700" : unchecked ? "text-muted-foreground" : "text-amber-700"} aria-hidden>{i.present ? <Check className="size-4" /> : <X className="size-4" />}</span>
                  <span className="min-w-[9rem] flex-1">{i.label}</span>
                  {warn > 0 && <Pill tone="amber">{warn} to check</Pill>}
                  <span className={i.present ? "text-emerald-800 dark:text-emerald-300" : unchecked ? "text-muted-foreground" : "text-amber-800 dark:text-amber-300"}>{i.present ? (i.files.length > 1 ? `${i.files.length} in` : "In") : unchecked ? "…" : "Still needed"}</span>
                  <ChevronRight className={`size-4 text-muted-foreground transition ${isOpen ? "rotate-90" : ""}`} aria-hidden />
                </button>
                {isOpen && <div className="space-y-1 px-3 pb-3">{i.files.length ? i.files.map(fileRow) : <p className="pt-1 text-xs text-muted-foreground">Nothing for this one yet.</p>}</div>}
              </li>
            );
          })}
          {p.loose.length > 0 && (
            <li>
              <button type="button" aria-expanded={open === "loose"} onClick={() => setOpen(open === "loose" ? null : "loose")} className="flex w-full flex-wrap items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50">
                <CircleAlert className="size-4 text-amber-700" aria-hidden /><span className="flex-1">Photos not in the list yet ({p.loose.length})</span><span className="text-amber-800 dark:text-amber-300">Check each one</span>
                <ChevronRight className={`size-4 text-muted-foreground transition ${open === "loose" ? "rotate-90" : ""}`} aria-hidden />
              </button>
              {open === "loose" && <div className="space-y-1 px-3 pb-3">{p.loose.map(fileRow)}</div>}
            </li>
          )}
        </ul>
        {!p.approval && p.canApprove && total > 0 && (
          <div className="space-y-2 border-t pt-3">
            <div className="flex flex-wrap gap-2">
              {p.canMoveToSold && <Button disabled={stepBusy || !(p.rule.allowed)} onClick={() => approve(true)}>{stepBusy ? <Loader2 className="animate-spin" /> : <FolderInput />} Approve and move to Sold</Button>}
              <Button variant={p.canMoveToSold ? "outline" : "default"} disabled={stepBusy || (!p.rule.allowed && !(p.rule.adminOverride && p.isAdmin))} onClick={() => approve(false)}>{stepBusy ? <Loader2 className="animate-spin" /> : <BadgeCheck />} {p.canMoveToSold ? "Approve only" : "Approve: all in order"}</Button>
            </div>
            {!p.rule.allowed && p.rule.reason && <p className="text-xs text-muted-foreground">{p.rule.reason}{p.rule.adminOverride && !p.isAdmin ? " Only an Admin can approve before then." : ""}</p>}
            {p.canMoveToSold && p.rule.allowed && <p className="text-xs text-muted-foreground">All three papers are in and the IN documents are approved: you can approve and move the car to Sold in one go.</p>}
          </div>
        )}
        {p.approval && p.isAdmin && <AdminFixButton plate={p.plate} fix={{ kind: "approval" }} label="Withdraw the approval (Admin)" title="Withdraw the approval?" warning="The stage goes back to Not approved, so a mistake can be corrected and approved again." confirmLabel="Yes, withdraw it" run={() => withdrawStageAction(p.plate, p.stage)} />}
        {dialog}
      </CardContent>
    </Card>
  );
}
