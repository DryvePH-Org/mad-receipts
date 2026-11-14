"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Pill, type Tone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { chooseFolderAction, relinkAction } from "../actions";
import type { CarViewData } from "./types";

const STATUS_TONE: Record<string, Tone> = { complete: "emerald", missing: "amber", review: "red", unread: "blue", unlinked: "zinc" };

/** The line under the car's name (where it is, its AR, links), what the bots are doing for it, and the folder chooser when it has no single folder. */
export function CarTop({ data }: { data: CarViewData }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) => start(async () => { const r = await fn(); if (r.ok) toast.success(r.message); else toast.error(r.message); router.refresh(); });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Pill tone={data.location === "sold" ? "teal" : "grey"}>{data.location === "sold" ? "In Sold units" : "In Available units"}</Pill>
        {data.match === "linked" && <Pill tone={STATUS_TONE[data.statusKey] ?? "grey"}>{data.statusLabel}</Pill>}
        {data.deal ? <Link href={`/deals/${data.deal.id}`} className="text-sm underline underline-offset-2">AR {data.deal.dealNo} · {data.deal.buyerName}{data.deal.hasReceipt ? "" : " (no AR yet)"}</Link> : <span className="text-sm text-muted-foreground">No AR for this car yet</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/documents/${data.plate}/transmittal`} />}><FileText /> Transmittal receipt</Button>
          {data.folderUrl && <Button variant="outline" size="sm" nativeButton={false} render={<a href={data.folderUrl} target="_blank" rel="noreferrer" />}><ExternalLink /> Open the folder</Button>}
        </div>
      </div>

      {data.botWork.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-blue-50 p-3 text-sm text-blue-950 dark:bg-blue-500/10 dark:text-blue-100" role="status" aria-live="polite">
          {data.botWork.map((w) => <li key={w.label} className="flex items-center gap-2"><Loader2 className={`size-4 shrink-0 ${w.waiting ? "" : "animate-spin"}`} aria-hidden />{w.label}</li>)}
        </ul>
      )}

      {data.match !== "linked" && (
        <Card id="folder">
          <CardHeader><CardTitle>{data.match === "none" ? "No folder found for this plate" : "More than one folder matches this plate"}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{data.match === "none" ? "Add documents for this plate (it makes the folder), or create or rename the car's folder in Drive so its name ends with the plate in brackets, like “14 Toyota Vios (AAX-3622)”, then search again." : "Choose the right one. The others stay where they are."}</p>
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
    </div>
  );
}
