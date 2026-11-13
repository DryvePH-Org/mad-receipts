"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";
import { Pill, type Tone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SheetPreview } from "@/lib/docs/bible-view";
import { checkSheetAction, sendSheetAction } from "../actions";

export interface SheetCardData {
  plate: string; frozen: boolean; configured: boolean;
  statuses: { kind: string; status: string; error: string | null; updatedAt: string }[];
  /** built instantly from the car's own documents, without asking the bot */
  preview: SheetPreview | null;
}

const KIND: Record<string, string> = { checklist: "Checklist after approval", submitted: "Handed off (monthly tab)", received: "Documents back (monthly tab)" };
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
  const [preview, setPreview] = useState<SheetPreview | null>(data.preview);
  const [problem, setProblem] = useState<string | null>(null);
  const [working, setWorking] = useState<"check" | "send" | null>(null);

  const doCheck = () => start(async () => {
    setProblem(null); setWorking("check");
    const r = await checkSheetAction(data.plate);
    if (r.ok) setPreview(r.preview); else setProblem(r.message);
    setWorking(null); router.refresh();
  });
  const doSend = () => start(async () => {
    setWorking("send");
    const r = await sendSheetAction(data.plate);
    if (r.ok) toast.success(r.message); else toast.error(r.message);
    setWorking(null); router.refresh();
  });

  return (
    <Card>
      <CardHeader><CardTitle className="flex flex-wrap items-center gap-3">Docs Bible sheet
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

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy || !data.configured} onClick={doCheck}>{working === "check" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check the sheet now</Button>
          <Button disabled={busy || data.frozen || !data.configured} onClick={doSend}>{working === "send" ? <Loader2 className="animate-spin" /> : <Send />} Send to the sheet now</Button>
        </div>
        {!data.configured && <p className="text-muted-foreground">The grokbot or the sheet is not set up on this server yet.</p>}
        {busy && <p className="text-muted-foreground">Waiting for the bot… this can take a minute or two.</p>}
        {problem && <p role="alert" className="text-destructive">{problem}</p>}
      </CardContent>
    </Card>
  );
}
