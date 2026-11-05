"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { AskDialog } from "@/components/shared/ask-dialog";
import { Button } from "@/components/ui/button";
import { approveReceipt, rejectReceipt } from "./actions";

export function ReviewButtons({ receiptId, receiptNo }: { receiptId: string; receiptNo: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  return (
    <>
      <Button variant="outline" className="text-destructive" disabled={pending} onClick={() => setRejecting(true)}>Reject</Button>
      <Button disabled={pending} onClick={() => start(async () => {
        const r = await approveReceipt(receiptId);
        if (r.ok) { toast.success(`Receipt ${receiptNo} approved. Drive, Sheets, the inventory sheet and Telegram will update.`); router.refresh(); } else toast.error(r.error);
      })}><Check /> {pending ? "Approving…" : "Approve"}</Button>
      <AskDialog open={rejecting} onOpenChange={setRejecting} title={`Reject receipt ${receiptNo}?`} description="The salesperson is told why and fills in a new receipt."
        fields={[{ id: "reason", label: "Reason", type: "textarea", required: true, placeholder: "e.g. The check photo is blurry" }]} confirm="Reject" danger
        onConfirm={async (v) => { const r = await rejectReceipt(receiptId, v.reason); if (r.ok) router.refresh(); else return r.error; }} />
    </>
  );
}
