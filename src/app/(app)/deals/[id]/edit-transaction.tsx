"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { AskDialog, type AskField } from "@/components/shared/ask-dialog";
import { Button } from "@/components/ui/button";
import { fromCentavos } from "@/lib/rules/money";
import { addEarlierReceipt, editDeal, editReceipt } from "./actions";

const money = (c: number) => (c ? fromCentavos(c) : "");

export interface EditDealData {
  id: string; dealNo: string; buyer: string; address: string; contact: string; price: number; sale: "cash" | "financing"; institution: string; dp: number; fee: number; years: string;
  tradeIn: number; tradeInUnit: string; lieu: number; lieuUntil: string; earlier: number; due: string; dueText: string;
  units: { make: string; plate: string; color: string }[];
}

/** Super Admin only: correct the whole transaction (buyer, cars, cash or financing, price, trade-in, paid before, due date). */
export function EditDeal({ deal }: { deal: EditDealData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const fin = deal.sale === "financing";
  const fields: AskField[] = [
    { id: "buyer", label: "Buyer's name", value: deal.buyer, required: true },
    { id: "address", label: "Address", value: deal.address },
    { id: "contact", label: "Contact", value: deal.contact },
    ...deal.units.flatMap((u, n) => [
      { id: `u${n}_make`, label: deal.units.length > 1 ? `Car ${n + 1}: make / type` : "Car: make / type", value: u.make },
      { id: `u${n}_plate`, label: deal.units.length > 1 ? `Car ${n + 1}: plate` : "Car: plate", value: u.plate },
      { id: `u${n}_color`, label: deal.units.length > 1 ? `Car ${n + 1}: color` : "Car: color", value: u.color },
    ]),
    { id: "sale", label: "Sale type (cash or financing)", value: deal.sale, required: true },
    { id: "price", label: "Agreed price", type: "money", value: money(deal.price), required: true },
    { id: "institution", label: fin ? "Financing institution" : "Financing institution (only if financing)", value: deal.institution },
    { id: "dp", label: "Down payment (financing; leave empty until the lender approves)", type: "money", value: money(deal.dp) },
    { id: "fee", label: "Processing fee (financing)", type: "money", value: money(deal.fee) },
    { id: "years", label: "Years to pay (financing)", value: deal.years },
    { id: "tv", label: "Trade-in value", type: "money", value: money(deal.tradeIn) },
    { id: "tiUnit", label: "Trade-in car", value: deal.tradeInUnit },
    { id: "lieu", label: "In lieu of documents (amount)", type: "money", value: money(deal.lieu) },
    { id: "lieuUntil", label: "In lieu of documents, held until", type: "date", value: deal.lieuUntil },
    { id: "earlier", label: "Paid before the first receipt", type: "money", value: money(deal.earlier) },
    { id: "due", label: "Balance due on (date)", type: "date", value: deal.due },
    { id: "dueText", label: "Or the due date as text (leave the date empty)", value: deal.dueText },
  ];
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Pencil /> Edit transaction {deal.dealNo}</Button>
      <AskDialog open={open} onOpenChange={setOpen} title={`Edit transaction ${deal.dealNo}`} description="Super Admin only. The whole transaction can be corrected. The balance of every receipt and the car's sale record are worked out again, and the change is written to the history. Payments, the receipt number and the date are changed on each receipt."
        fields={fields} confirm="Save the changes"
        onConfirm={async (v) => { const r = await editDeal(deal.id, v); if (!r.ok) return r.error; toast.success("The transaction was updated."); router.refresh(); }} />
    </>
  );
}

/** Super Admin only: put in a receipt that was not entered when it happened (the earnest money's AR after the full payment was saved first). */
export function AddEarlierReceipt({ dealId, earlier }: { dealId: string; earlier: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Plus /> Add an earlier receipt</Button>
      <AskDialog open={open} onOpenChange={setOpen} title="Add an earlier receipt" description={`For a receipt that was not entered when it happened, such as the earnest money's AR after the full payment was saved first. Its amount comes out of "Paid before the first receipt" (${money(earlier) || "0"} now), so the balance does not change.`}
        fields={[
          { id: "no", label: "Receipt number", required: true },
          { id: "date", label: "Receipt date", type: "date", required: true },
          { id: "kind", label: "Kind (earnest, partial or full)", value: "earnest" },
          { id: "amount", label: "Amount", type: "money", required: true },
          { id: "method", label: "Paid by (cash or check)", value: "cash" },
        ]} confirm="Add the receipt"
        onConfirm={async (v) => { const r = await addEarlierReceipt(dealId, v); if (!r.ok) return r.error; toast.success("The receipt was added."); router.refresh(); }} />
    </>
  );
}

/** Super Admin only: correct one saved receipt (number, date, the amount of each payment). */
export function EditReceipt({ receipt }: { receipt: { id: string; no: string; date: string; kind: string; remarks: string; payments: { id: string; label: string; amount: number }[] } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const fields: AskField[] = [
    { id: "no", label: "Receipt number", value: receipt.no, required: true },
    { id: "date", label: "Receipt date", type: "date", value: receipt.date, required: true },
    { id: "kind", label: "Kind (earnest, partial or full)", value: receipt.kind },
    { id: "remarks", label: "Remarks", type: "textarea", value: receipt.remarks },
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
