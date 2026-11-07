"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { AskDialog } from "@/components/shared/ask-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { phraseMatches, RESETS, type ResetInfo } from "@/lib/reset";
import type { ResetCounts } from "@/lib/reset-run";
import { getResetCounts, resetData } from "./reset-actions";

const HOW_MANY: Record<string, (c: ResetCounts) => string> = {
  transactions: (c) => `${c.deals ?? 0} deals · ${c.receipts ?? 0} receipts · ${c.attachments ?? 0} proof photos`,
  sync: (c) => `${c.sync_jobs ?? 0} sync jobs`,
  activity: (c) => `${c.audit_logs ?? 0} activity lines`,
  documents: (c) => `${c.unit_folders ?? 0} car folders · ${c.folder_files ?? 0} files`,
  everything: (c) => `${(c.deals ?? 0) + (c.receipts ?? 0) + (c.sync_jobs ?? 0) + (c.audit_logs ?? 0) + (c.unit_folders ?? 0)} items in all`,
};

/** For testing, and for when it is needed: wipe data, each only after typing the exact words. */
export function ResetPanel() {
  const [counts, setCounts] = useState<ResetCounts | null>(null);
  const [ask, setAsk] = useState<ResetInfo | null>(null);
  const refresh = () => getResetCounts().then(setCounts).catch(() => setCounts(null));
  useEffect(() => { refresh(); }, []);

  return (
    <div className="space-y-5">
      <div role="note" className="flex gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-900 dark:bg-red-500/10 dark:text-red-200">
        <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
        <p><b className="font-medium">Deleted data cannot be brought back.</b> These buttons are for testing, or a clean start. Each one asks you to type its words first. Users, roles and settings are never deleted here, and nothing in Google Sheets or Drive is touched.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {RESETS.map((r) => (
          <Card key={r.kind} className={r.kind === "everything" ? "ring-destructive/40 lg:col-span-2" : undefined}>
            <CardHeader><CardTitle>{r.title}</CardTitle>{counts && <p className="text-sm text-muted-foreground tabular-nums">Now: {HOW_MANY[r.kind](counts)}</p>}</CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p><b className="font-medium">Removes:</b> {r.removes}</p>
              <p className="text-muted-foreground"><b className="font-medium text-foreground">Keeps:</b> {r.keeps}</p>
              <Button variant="destructive" onClick={() => setAsk(r)}>{r.title}…</Button>
            </CardContent>
          </Card>
        ))}
      </div>
      {ask && (
        <AskDialog open onOpenChange={(o) => { if (!o) setAsk(null); }} title={`${ask.title}?`} description={`${ask.removes} This cannot be undone.`} confirm={ask.title} danger
          fields={[{ id: "typed", label: `Type ${ask.phrase} to confirm`, placeholder: ask.phrase, required: true }]}
          onConfirm={async (v) => {
            if (!phraseMatches(ask.kind, v.typed ?? "")) return `Type ${ask.phrase} exactly as shown.`;
            const r = await resetData(ask.kind, v.typed);
            if (!r.ok) return r.error;
            toast.success(r.message);
            setAsk(null);
            refresh();
          }} />
      )}
    </div>
  );
}
