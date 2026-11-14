"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { CASE_LABELS, CASES } from "@/lib/docs/types";
import { setCaseAction } from "../actions";
import type { CarViewData } from "./types";

/** The papers the car's case needs, ticked from the photos. The case is worked out from the papers and can be set by hand. */
export function ChecklistCard({ data }: { data: CarViewData }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const chosen = data.caseSource === "manual";
  const choose = (value: string) => start(async () => { const r = await setCaseAction(data.plate, value); if (r.ok) toast.success(r.message); else toast.error(r.message); router.refresh(); });
  const unchecked = !data.scanned || data.pending > 0 || data.scanning; // not final until every photo has been read
  const missing = data.items.filter((i) => !i.present);
  const groups = [["Before the sale: the Available folder", data.items.filter((i) => i.stage === "available")], ["After the sale: Sales uploads these", data.items.filter((i) => i.stage === "sold")]] as const;
  return (
    <Card id="checklist">
      <CardHeader><CardTitle className="flex flex-wrap items-center gap-3">Papers needed
        <label className="ml-auto flex items-center gap-2 text-sm font-normal text-muted-foreground">Case
          <NativeSelect aria-label="Case" className="w-48" value={chosen ? data.caseType : ""} disabled={busy} onChange={(e) => choose(e.target.value)}>
            {!chosen && <option value="" disabled>Choose the case…</option>}
            {CASES.map((c) => <option key={c} value={c}>{CASE_LABELS[c]}</option>)}
          </NativeSelect></label></CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className={`flex flex-wrap items-center gap-3 rounded-lg p-3 text-sm ${chosen ? "bg-muted" : "bg-amber-50 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100"}`}>
          <p className="min-w-0 flex-1"><b>You decide the case.</b> {data.scanned && data.pending === 0 ? <>The bot suggests <b>{CASE_LABELS[data.suggestedCase]}</b>: {data.caseReason}</> : "The bot suggests one after the scan."}{!chosen && " Approval needs the case chosen."}
            {chosen && data.caseType !== data.suggestedCase && data.scanned && <span className="block text-xs text-muted-foreground">You chose {CASE_LABELS[data.caseType]}; the bot suggested {CASE_LABELS[data.suggestedCase]}.</span>}</p>
          {data.scanned && data.pending === 0 && (!chosen || data.caseType !== data.suggestedCase) && <Button size="sm" variant="outline" disabled={busy} onClick={() => choose(data.suggestedCase)}>Use {CASE_LABELS[data.suggestedCase]}</Button>}
        </div>
        {groups.map(([title, list]) => (
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
        <p className="text-sm text-muted-foreground">{!data.scanned ? "Looking at the folder…" : unchecked ? "The list is not final until every photo has been scanned." : missing.length === 0 ? "Every paper is in." : `${missing.length} paper${missing.length === 1 ? " is" : "s are"} still missing. Papers for the sale come from Sales after the car is sold.`}</p>
      </CardContent>
    </Card>
  );
}
