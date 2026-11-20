"use client";

import { useState } from "react";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";

/**
 * An Admin may change a car's information after it is in Sold or handed off (a mistake in the documents): the page asks first, then goes on.
 * `active` is false for everyone else and for cars still in Available, and then `confirm` just runs the change.
 */
export function useEditConfirm(active: boolean, what = "change this") {
  const [pending, setPending] = useState<{ go: () => void; cancel?: () => void } | null>(null);
  const confirm = (go: () => void, cancel?: () => void) => { if (active) setPending({ go, cancel }); else go(); };
  const close = () => { pending?.cancel?.(); setPending(null); };
  const dialog = (
    <ResponsiveDialog open={!!pending} onOpenChange={(o) => !o && close()} title="Change a car that is already sold?" description="This car is already in Sold units. You are changing it as Admin.">
      <div className="space-y-4 text-sm">
        <p className="rounded-lg bg-amber-50 p-3 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">Use this to correct a mistake in the documents. The change is saved at once and kept in the history, with your name.</p>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={() => { const go = pending?.go; setPending(null); go?.(); }}>Yes, {what}</Button></div>
      </div>
    </ResponsiveDialog>
  );
  return { confirm, dialog };
}
