"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fileReceiptsAction } from "../actions";

/** The car's approved receipts and a button to put them in its Drive folder (Documentation and Admin: it never happens by itself). */
export function ReceiptsCard({ plate, receipts }: { plate: string; receipts: { id: string; receiptNo: string; filed: boolean }[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const todo = receipts.filter((r) => !r.filed).length;
  return (
    <Card id="receipts">
      <CardHeader><CardTitle>Receipts in Drive</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
          {receipts.map((r) => <li key={r.id} className="flex items-center gap-3 px-3 py-2"><Receipt className="size-4 text-muted-foreground" aria-hidden /><span className="flex-1">Receipt {r.receiptNo}</span>{r.filed ? <span className="flex items-center gap-1 text-emerald-800 dark:text-emerald-300"><Check className="size-4" aria-hidden />In the folder</span> : <span className="text-muted-foreground">Not in the folder</span>}</li>)}
        </ul>
        <Button variant="outline" disabled={busy || todo === 0} onClick={() => start(async () => { const r = await fileReceiptsAction(plate); if (r.ok) toast.success(r.message); else toast.error(r.message); router.refresh(); })}>{busy ? <Loader2 className="animate-spin" /> : <Receipt />} {todo ? `Put ${todo} receipt${todo === 1 ? "" : "s"} in the car's folder` : "All receipts are in the folder"}</Button>
        <p className="text-xs text-muted-foreground">Each receipt goes in as a printable page, with its proof photos. They are not scanned as car documents.</p>
      </CardContent>
    </Card>
  );
}
