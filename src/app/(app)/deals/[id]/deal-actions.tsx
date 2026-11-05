"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Printer } from "lucide-react";
import { AskDialog } from "@/components/shared/ask-dialog";
import { Button } from "@/components/ui/button";
import { cancelDeal, setLoanStatus, voidReceipt } from "./actions";

type Dialog = null | { kind: "cancel" } | { kind: "void"; receiptId: string; receiptNo: string; amount: string } | { kind: "loan" };

/** Admin-only buttons on a deal: release the loan, void a receipt, cancel the deal. */
export function DealAdminActions({
  dealId, today, loanStatus, institution, loanAmount, canCancel, mode, receiptId, receiptNo, amountText, carFreed,
}: {
  dealId: string; today: string; loanStatus: string; institution: string; loanAmount: string; canCancel: boolean;
  mode: "deal" | "receipt"; receiptId?: string; receiptNo?: string; amountText?: string; carFreed?: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const done = () => router.refresh();

  if (mode === "receipt") {
    return (
      <>
        <Button size="sm" variant="outline" className="text-destructive" onClick={() => setDialog({ kind: "void", receiptId: receiptId!, receiptNo: receiptNo!, amount: amountText! })}>Void</Button>
        <AskDialog open={dialog?.kind === "void"} onOpenChange={(o) => !o && setDialog(null)} title={`Void receipt ${receiptNo}?`} description={`${amountText} will stop counting toward this deal. This is logged.`}
          fields={[{ id: "reason", label: "Why is it being voided?", type: "textarea", required: true }]} confirm="Void receipt" danger
          onConfirm={async (v) => { const r = await voidReceipt(receiptId!, v.reason); if (r.ok) done(); else return r.error; }} />
      </>
    );
  }
  return (
    <div className="space-y-3">
      {loanStatus !== "none" && (
        <>
          {loanStatus === "released" ? (
            <Button variant="outline" onClick={async () => { const r = await setLoanStatus(dealId, "waiting", ""); if (r.ok) done(); }}>Mark the loan as waiting again</Button>
          ) : (
            <Button onClick={() => setDialog({ kind: "loan" })}><Check /> Mark the loan as released</Button>
          )}
          <AskDialog open={dialog?.kind === "loan"} onOpenChange={(o) => !o && setDialog(null)} title="Mark the loan as released?" description={`${institution} paid ${loanAmount}. ${carFreed ? "" : "The car shows as Sold in the inventory sheet once the buyer's part is also paid."}`}
            fields={[{ id: "on", label: "Release date", type: "date", value: today, required: true }]} confirm="Mark as released"
            onConfirm={async (v) => { const r = await setLoanStatus(dealId, "released", v.on); if (r.ok) done(); else return r.error; }} />
        </>
      )}
      {canCancel && (
        <>
          <Button variant="outline" className="text-destructive" onClick={() => setDialog({ kind: "cancel" })}>Cancel this deal</Button>
          <AskDialog open={dialog?.kind === "cancel"} onOpenChange={(o) => !o && setDialog(null)} title="Cancel this deal?" description="The car becomes Available again. Earnest money and partial payments are non-refundable unless you enter a refund."
            fields={[{ id: "reason", label: "Reason", type: "textarea", required: true }, { id: "refund", label: "Amount refunded to the buyer", type: "money", value: "0" }]} confirm="Cancel the deal" danger
            onConfirm={async (v) => { const r = await cancelDeal(dealId, v.reason, v.refund); if (r.ok) done(); else return r.error; }} />
        </>
      )}
    </div>
  );
}

export function PrintReceiptButton({ receiptId }: { receiptId: string }) {
  return (
    <Button size="sm" variant="outline" nativeButton={false} render={<a href={`/print/${receiptId}`} target="_blank" rel="noreferrer" />}><Printer /> Print</Button>
  );
}
