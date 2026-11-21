"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fileReceiptsAction } from "../actions";

/** The car's saved receipts and a button to put them in its Drive folder (Sales and Documentation: it never happens by itself). */
export function ReceiptsCard({ plate, receipts }: { plate: string; receipts: { id: string; receiptNo: string; filed: boolean; copyName?: string }[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const todo = receipts.filter((r) => !r.filed).length;
  return (
    <Card id="receipts">
      <CardHeader><CardTitle>The AR (receipt) in the car&apos;s folder</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
          {receipts.map((r) => <li key={r.id} className="flex items-center gap-3 px-3 py-2"><Receipt className="size-4 text-muted-foreground" aria-hidden /><span className="flex-1">Receipt {r.receiptNo}{r.filed && <span className="block text-xs text-muted-foreground">Saved as an UNSIGNED copy{r.copyName ? `: ${r.copyName}` : ""}</span>}</span>{r.filed ? <span className="flex items-center gap-1 text-amber-800 dark:text-amber-300"><Check className="size-4" aria-hidden />Unsigned copy in the folder</span> : <span className="text-muted-foreground">Not in the folder yet</span>}</li>)}
        </ul>
        <Button variant="outline" disabled={busy || todo === 0} onClick={() => start(async () => { const r = await fileReceiptsAction(plate); if (r.ok) toast.success(r.message); else toast.error(r.message); router.refresh(); })}>{busy ? <Loader2 className="animate-spin" /> : <Receipt />} {todo ? `Save ${todo} receipt${todo === 1 ? "" : "s"} in the car's folder (unsigned)` : "Every receipt is saved in the folder"}</Button>
        <p className="text-xs text-muted-foreground">Each receipt goes in as a printable page marked UNSIGNED, with its proof photos. They are not scanned as car documents. The signed paper copy is photographed and uploaded by Sales in Sold papers; that is the AR on the checklist.</p>
      </CardContent>
    </Card>
  );
}
