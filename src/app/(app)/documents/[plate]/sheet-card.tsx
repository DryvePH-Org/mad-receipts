"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Pill, type Tone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { previewSheetAction, sendSheetAction, type SheetPreview } from "../actions";

export interface SheetCardData {
  plate: string; frozen: boolean; configured: boolean;
  statuses: { kind: string; status: string; error: string | null; updatedAt: string }[];
}

const KIND: Record<string, string> = { checklist: "Checklist after approval", submitted: "Handed off (monthly tab)", received: "Documents back (monthly tab)" };
const TONE: Record<string, Tone> = { done: "emerald", previewed: "blue", frozen: "amber", conflict: "red", failed: "red" };
const LABEL: Record<string, string> = { done: "Written", previewed: "Previewed only", frozen: "Waiting (sheets frozen)", conflict: "Needs a look", failed: "Failed" };
const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });

/** The Docs Bible sheet for this car: what was written, what would be, and a button to send it. */
export function SheetCard({ data }: { data: SheetCardData }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [preview, setPreview] = useState<SheetPreview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const doPreview = () => start(async () => {
    setProblem(null); setPreview(null);
    const r = await previewSheetAction(data.plate);
    if (r.ok) setPreview(r.preview); else setProblem(r.message);
  });
  const doSend = () => start(async () => {
    const r = await sendSheetAction(data.plate);
    if (r.ok) toast.success(r.message); else toast.error(r.message);
    router.refresh();
  });

  return (
    <Card>
      <CardHeader><CardTitle className="flex flex-wrap items-center gap-3">Docs Bible sheet
        {data.frozen && <Pill tone="amber">Sheets frozen: nothing is written</Pill>}</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        {data.statuses.length === 0 ? <p className="text-muted-foreground">Nothing has been sent to the sheet for this car yet.</p> : (
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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy || !data.configured} onClick={doPreview}>{busy ? <Loader2 className="animate-spin" /> : <Eye />} Preview what would change</Button>
          <Button disabled={busy || data.frozen || !data.configured} onClick={doSend}><Send /> Send to the sheet now</Button>
        </div>
        {!data.configured && <p className="text-muted-foreground">The grokbot or the sheet is not set up on this server yet.</p>}
        {busy && <p className="text-muted-foreground">Waiting for the bot… this can take a minute.</p>}
        {problem && <p role="alert" className="text-destructive">{problem}</p>}
        {preview && (
          <div className="space-y-3 rounded-lg border p-3" aria-live="polite">
            {!preview.found ? <p className="text-amber-800 dark:text-amber-300">{preview.notes[0] ?? preview.message ?? "Not found in the sheet."}</p> : (
              <>
                <p className="font-medium">Row {preview.row} in the sheet{preview.changes.length ? `: ${preview.changes.length} cell${preview.changes.length === 1 ? "" : "s"} would change` : ": nothing to change"}</p>
                {preview.changes.length > 0 && (
                  <ul className="space-y-1">
                    {preview.changes.map((c) => <li key={c.header} className="flex flex-wrap gap-2"><b className="w-40">{c.header}</b><span className="text-muted-foreground">{c.before || "(blank)"}</span><span aria-hidden>→</span><span className="whitespace-pre-line">{c.after}</span></li>)}
                  </ul>
                )}
                <details><summary className="cursor-pointer text-muted-foreground">The note added to REMARKS I</summary><p className="mt-2 whitespace-pre-line rounded-lg bg-muted p-2 text-xs">{preview.note}</p></details>
                {preview.notes.map((n) => <p key={n} className="text-amber-800 dark:text-amber-300">{n}</p>)}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
