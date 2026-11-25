"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { AskDialog, type AskField } from "@/components/shared/ask-dialog";
import { Button } from "@/components/ui/button";
import { fromCentavos } from "@/lib/rules/money";
import { editDeal, editReceipt } from "./actions";

const money = (c: number) => (c ? fromCentavos(c) : "");

/** Super Admin only: correct the transaction (buyer, price, financing, due date). */
export function EditDeal({ deal }: { deal: { id: string; dealNo: string; buyer: string; address: string; contact: string; price: number; financing: boolean; institution: string; dp: number; fee: number; due: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const fields: AskField[] = [
    { id: "buyer", label: "Buyer's name", value: deal.buyer, required: true },
    { id: "address", label: "Address", value: deal.address },
    { id: "contact", label: "Contact", value: deal.contact },
    { id: "price", label: "Agreed price", type: "money", value: money(deal.price), required: true },
    ...(deal.financing ? [
      { id: "institution", label: "Financing institution", value: deal.institution, required: true },
      { id: "dp", label: "Down payment (leave empty until the lender approves)", type: "money" as const, value: money(deal.dp) },
      { id: "fee", label: "Processing fee", type: "money" as const, value: money(deal.fee) },
    ] : []),
    { id: "due", label: "Balance due on", type: "date", value: deal.due },
  ];
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Pencil /> Edit transaction {deal.dealNo}</Button>
      <AskDialog open={open} onOpenChange={setOpen} title={`Edit transaction ${deal.dealNo}`} description="Super Admin only. The balance and the car's sale record are worked out again, and the change is written to the history. Payments are changed on each receipt."
        fields={fields} confirm="Save the changes"
        onConfirm={async (v) => { const r = await editDeal(deal.id, v); if (!r.ok) return r.error; toast.success("The transaction was updated."); router.refresh(); }} />
    </>
  );
}

/** Super Admin only: correct one saved receipt (number, date, the amount of each payment). */
export function EditReceipt({ receipt }: { receipt: { id: string; no: string; date: string; payments: { id: string; label: string; amount: number }[] } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const fields: AskField[] = [
    { id: "no", label: "Receipt number", value: receipt.no, required: true },
    { id: "date", label: "Receipt date", type: "date", value: receipt.date, required: true },
    ...receipt.payments.map((p) => ({ id: `p_${p.id}`, label: `${p.label} amount`, type: "money" as const, value: money(p.amount) })),
  ];
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Pencil /> Edit</Button>
      <AskDialog open={open} onOpenChange={setOpen} title={`Edit receipt ${receipt.no}`} description="Super Admin only. The balance of the transaction is counted again."
        fields={fields} confirm="Save the changes"
        onConfirm={async (v) => { const r = await editReceipt(receipt.id, v); if (!r.ok) return r.error; toast.success("The receipt was updated."); router.refresh(); }} />
    </>
  );
}
