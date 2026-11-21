"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AskDialog } from "@/components/shared/ask-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { deleteDeal } from "./actions";

/** Admin only: delete the transaction and everything that hangs on it. Collapsed, and the deal number must be typed. */
export function DeleteDeal({ dealId, dealNo, receipts, proofs }: { dealId: string; dealNo: string; receipts: number; proofs: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <Card size="sm" className="gap-0 py-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 p-4 font-heading text-base font-medium">Delete this transaction (Admin)<span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">Show</span></summary>
        <CardContent className="space-y-3 pb-4 text-sm">
          <p className="text-muted-foreground">Use it for a transaction that should not exist (a test, or one made by mistake). It cannot be undone in the app.</p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>The deal, its {receipts} receipt{receipts === 1 ? "" : "s"}, the payments and the {proofs} proof photo{proofs === 1 ? "" : "s"} are deleted.</li>
            <li>The audit copies in the receipts folder in Drive, and the AR copies in the car&apos;s folder (the app&apos;s UNSIGNED copy and the signed AR paper), go to the Drive trash for 30 days.</li>
            <li>The buyer&apos;s ID, the deed and every other paper in the car&apos;s folder stay.</li>
            <li>The car goes back to Onhand.</li>
          </ul>
          <Button variant="destructive" onClick={() => setOpen(true)}><Trash2 /> Delete {dealNo}</Button>
        </CardContent>
      </details>
      <AskDialog open={open} onOpenChange={setOpen} title={`Delete transaction ${dealNo}?`} description="Everything listed above is deleted. Type the deal number to confirm."
        fields={[{ id: "no", label: `Type ${dealNo}`, required: true }]} confirm="Yes, delete it" danger
        onConfirm={async (v) => { const r = await deleteDeal(dealId, v.no); if (!r.ok) return r.error; toast.success(r.message); router.push("/deals"); router.refresh(); }} />
    </Card>
  );
}
