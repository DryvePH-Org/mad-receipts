"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import type { StepOutcome } from "../actions";

/** Runs a step that may need the person to confirm what is still open, and shows the confirmation. */
export function useStep() {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [ask, setAsk] = useState<{ title: string; missing: string[]; go: () => void } | null>(null);
  const done = (r: { ok: boolean; message?: string }) => { if (r.ok) toast.success(r.message ?? "Done."); else toast.error(r.message ?? "Could not do that."); router.refresh(); };
  const step = (title: string, run: (confirm: boolean) => Promise<StepOutcome>) => start(async () => {
    const r = await run(false);
    if ("needsConfirm" in r) { setAsk({ title, missing: r.missing, go: () => start(async () => { setAsk(null); done(await run(true)); }) }); return; }
    done(r);
  });
  const dialog = (
    <ResponsiveDialog open={!!ask} onOpenChange={(o) => !o && setAsk(null)} title={ask?.title ?? ""} description="You can still go on. Nothing is deleted.">
      <div className="space-y-4">
        <ul className="list-disc space-y-1 rounded-lg bg-amber-50 p-3 pl-7 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{ask?.missing.map((m) => <li key={m}>{m}</li>)}</ul>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAsk(null)}>Cancel</Button><Button disabled={busy} onClick={() => ask?.go()}>Go on anyway</Button></div>
      </div>
    </ResponsiveDialog>
  );
  return { busy, start, done, step, dialog };
}
