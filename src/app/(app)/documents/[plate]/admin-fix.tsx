"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { adminFixAction } from "../actions";

/** An Admin button that changes a step already taken (approval, handoff). It always asks first and says what will happen. */
export function AdminFixButton({ plate, fix, label, title, warning, confirmLabel, disabled, run }: { plate: string; fix: unknown; label: string; title: string; warning: string; confirmLabel: string; disabled?: boolean; /** another action in place of the car's own fixes (the approval of OUT or of the transfer) */ run?: () => Promise<{ ok: boolean; message: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const go = () => start(async () => {
    const r = run ? await run() : await adminFixAction(plate, fix);
    if (r.ok) { toast.success(r.message); setOpen(false); } else toast.error(r.message);
    router.refresh();
  });
  return (
    <>
      <Button variant="outline" size="sm" disabled={disabled || busy} onClick={() => setOpen(true)}>{label}</Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={title} description="Admin only. Nothing is deleted, and the change is logged with your name.">
        <div className="space-y-4 text-sm">
          <p className="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{warning}</p>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={busy} onClick={go}>{confirmLabel}</Button></div>
        </div>
      </ResponsiveDialog>
    </>
  );
}
