"use client";

import { useTransition } from "react";
import { FolderInput, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fileDealReceiptsAction } from "../../documents/actions";

/** After a receipt is saved: puts the unsigned copy (and its proofs) in the car's Drive folder, when someone presses it. Sales and Documentation. */
export function FileArButton({ dealId }: { dealId: string }) {
  const [busy, start] = useTransition();
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <Button variant="outline" disabled={busy} onClick={() => start(async () => { const r = await fileDealReceiptsAction(dealId); if (r.ok) toast.success(r.message); else toast.error(r.message); })}>{busy ? <Loader2 className="animate-spin" /> : <FolderInput />} Save the AR in the car&apos;s folder (unsigned)</Button>
      <p className="text-xs text-muted-foreground">The copy is marked UNSIGNED. The signed paper is uploaded later by Sales.</p>
    </div>
  );
}
