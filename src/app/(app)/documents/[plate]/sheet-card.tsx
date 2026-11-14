"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { Pill, type Tone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SheetPreview } from "@/lib/docs/bible-view";
import type { PricelistPreview } from "@/lib/docs/pricelist-sync";
import type { Rule } from "@/lib/docs/stage";
import { checkSheetAction, sendSheetAction } from "../actions";

export interface SheetCardData {
  plate: string; frozen: boolean; configured: boolean;
  statuses: { kind: string; status: string; error: string | null; updatedAt: string }[];
  /** built instantly from the car's own documents, without asking the bot */
  preview: SheetPreview | null;
  /** the bot is busy with this car's row (since when) */
  working: { action: "check" | "send"; since: string } | null;
  /** what would go into the MAD Pricelist (INVENTORY 2026), from the inventory the Car status page reads */
  pricelist: PricelistPreview | null;
  /** may the checklist be sent now (it waits for the approval) */
  sendRule: Rule;
}

const KIND: Record<string, string> = { checklist: "Checklist after approval", pricelist: "MAD Pricelist (INVENTORY 2026)", submitted: "Handed off (monthly tab)", received: "Documents back (monthly tab)" };
const TONE: Record<string, Tone> = { done: "emerald", previewed: "blue", frozen: "amber", conflict: "red", failed: "red" };
const LABEL: Record<string, string> = { done: "Written", previewed: "Read from the sheet", frozen: "Waiting (sheets frozen)", conflict: "Needs a look", failed: "Failed" };
const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

/**
 * The Docs Bible sheet for this car. What would be written is shown at once from the car's documents; the bot is only asked when you press
 * "Check the sheet now" (to compare with the real cells) or "Send to the sheet now" (to write).
 */
export function SheetCard({ data }: { data: SheetCardData }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const preview = data.preview;
  const working = data.working;

  // The bot takes a minute or two, so the page does not wait for it: while it works, look again every few seconds.
  useEffect(() => {
    if (!working) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [working, router]);

  const begin = (run: () => Promise<{ ok: boolean; message: string }>) => start(async () => {
    setProblem(null);
    const r = await run();
    if (r.ok) toast.success(r.message); else { setProblem(r.message); toast.error(r.message); }
    router.refresh();
  });
  const doCheck = () => begin(() => checkSheetAction(data.plate));
  const doSend = () => begin(() => sendSheetAction(data.plate));

  return (
    <Card id="sheet">
      <CardHeader><CardTitle className="flex flex-wrap items-center gap-3">Sheets: Docs Bible and pricelist
        {data.frozen && <Pill tone="amber">Sheets frozen: nothing is written</Pill>}</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        {data.statuses.length > 0 && (
          <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
            {data.statuses.map((s) => (
              <li key={s.kind} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <span className="flex-1">{KIND[s.kind] ?? s.kind}</span>
                <Pill tone={TONE[s.status] ?? "zinc"}>{LABEL[s.status] ?? s.status}</Pill>
                <span className="text-xs text-muted-foreground">{when(s.updatedAt)}</span>
                {s.error && <span className="basis-full text-xs text-destructive">{s.error}</span>}
              </li>
            ))}
          </ul>
        )}

        {preview && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="font-medium">
              {preview.changes.length ? `${preview.changes.length} cell${preview.changes.length === 1 ? "" : "s"} would be written` : "Nothing to change"}
              {preview.row ? ` in row ${preview.row}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">{preview.checkedAt ? `Compared with the sheet as it was read on ${when(preview.checkedAt)}. Press “Check the sheet now” for the latest.` : "Not compared with the sheet yet. Press “Check the sheet now” to read the real cells."}</p>
            {preview.changes.length > 0 && (
              <ul className="space-y-1">
                {preview.changes.map((c) => <li key={c.header} className="flex flex-wrap gap-2"><b className="w-40">{c.header}</b>{c.before !== null && <><span className="text-muted-foreground">{c.before || "(blank)"}</span><span aria-hidden>→</span></>}<span className="whitespace-pre-line">{c.after}</span></li>)}
              </ul>
            )}
            <details><summary className="cursor-pointer text-muted-foreground">The note added to REMARKS I</summary><p className="mt-2 whitespace-pre-line rounded-lg bg-muted p-2 text-xs">{preview.note}</p></details>
            {preview.notes.map((n) => <p key={n} className="text-amber-800 dark:text-amber-300">{n}</p>)}
          </div>
        )}

        {data.pricelist && (
          <div className="space-y-2 rounded-lg border p-3">
            <p className="font-medium">MAD Pricelist (INVENTORY 2026): {data.pricelist.found ? (data.pricelist.changes.length ? `${data.pricelist.changes.length} cell${data.pricelist.changes.length === 1 ? "" : "s"} would be written` : "nothing to change") : "this plate is not in the tab"}</p>
            {data.pricelist.changes.length > 0 && (
              <ul className="space-y-1">{data.pricelist.changes.map((c) => <li key={c.header} className="flex flex-wrap gap-2"><b className="w-32">{c.header}</b><span className="text-muted-foreground">{c.before || "(blank)"}</span><span aria-hidden>→</span><span>{c.after}</span></li>)}</ul>
            )}
            {data.pricelist.notes.map((n) => <p key={n} className="text-amber-800 dark:text-amber-300">{n}</p>)}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy || !!working || !data.configured} onClick={doCheck}>{working?.action === "check" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check the sheet now</Button>
          <Button disabled={busy || !!working || data.frozen || !data.configured || !data.sendRule.allowed} onClick={doSend}>{working?.action === "send" ? <Loader2 className="animate-spin" /> : <Send />} Send to the sheet now</Button>
        </div>
        {!data.sendRule.allowed && data.sendRule.reason && <p className="text-xs text-muted-foreground">Sending: {data.sendRule.reason}</p>}
        {!data.configured && <p className="text-muted-foreground">The grokbot or the sheet is not set up on this server yet.</p>}
        {working && <p role="status" className="text-muted-foreground">{working.action === "send" ? "The bot is updating the sheet…" : "The bot is reading the sheet…"} This takes a minute or two; you can leave this page and come back.</p>}
        {problem && <p role="alert" className="text-destructive">{problem}</p>}
      </CardContent>
    </Card>
  );
}
