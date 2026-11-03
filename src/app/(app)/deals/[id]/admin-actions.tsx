"use client";

import { useActionState, useMemo, useState } from "react";
import { toast } from "sonner";
import { SalespeopleSection, type SalespersonOption } from "@/components/salespeople-section";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rowsFromDeal, toPayload, validateRows, type SalesRow } from "@/lib/salespeople/rows";
import { cancelDeal, editDeal, voidReceipt, type ActionResult } from "./actions";

/** Runs a server action, shows its message, and closes the dialog when it worked. */
function useDialogAction(action: (prev: ActionResult, form: FormData) => Promise<ActionResult>, close: () => void) {
  return useActionState(async (prev: ActionResult, form: FormData) => {
    const result = await action(prev, form);
    if (result?.ok) {
      toast.success(result.message);
      close();
    }
    return result;
  }, null);
}

function FormError({ state }: { state: ActionResult }) {
  if (!state || state.ok) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {state.message}
    </p>
  );
}

const textarea =
  "w-full rounded-lg border border-input bg-transparent p-3 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function VoidReceiptDialog({ receiptId, receiptNo }: { receiptId: string; receiptNo: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useDialogAction(voidReceipt, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="h-10 text-destructive" />}>Void</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void receipt No. {receiptNo}</DialogTitle>
          <DialogDescription>
            The receipt stays on record, marked voided. The deal&apos;s totals, status and the unit&apos;s status are
            worked out again, and the sheet and Telegram group are updated.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <input type="hidden" name="receiptId" value={receiptId} />
          <div className="space-y-2">
            <Label htmlFor={`void-${receiptId}`}>Reason</Label>
            <textarea id={`void-${receiptId}`} name="reason" required minLength={3} maxLength={300} rows={3} className={textarea} />
          </div>
          <FormError state={state} />
          <Button type="submit" disabled={pending} className="h-12 w-full bg-destructive text-base text-white hover:bg-destructive/90">
            {pending ? "Voiding…" : "Void this receipt"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CancelDealDialog({ dealId, plate, paid }: { dealId: string; plate: string; paid: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useDialogAction(cancelDeal, () => setOpen(false));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="h-12 flex-1 text-destructive" />}>Cancel deal</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel the deal for {plate}</DialogTitle>
          <DialogDescription>
            The buyer backs out. The unit goes back to Available and the Telegram group is told. Receipts stay on
            record.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <input type="hidden" name="dealId" value={dealId} />
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Reason</Label>
            <textarea id="cancel-reason" name="reason" required minLength={3} maxLength={300} rows={3} className={textarea} />
          </div>
          <label className="flex min-h-12 items-center gap-3 rounded-lg border p-3">
            <input type="checkbox" name="forfeit" className="size-5 accent-primary" />
            <span className="text-sm">
              <span className="font-medium">Forfeit the money</span>
              <span className="block text-muted-foreground">The {paid} paid so far is kept by the company.</span>
            </span>
          </label>
          <FormError state={state} />
          <Button type="submit" disabled={pending} className="h-12 w-full bg-destructive text-base text-white hover:bg-destructive/90">
            {pending ? "Cancelling…" : "Cancel this deal"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface EditableDeal {
  id: string;
  buyer_name: string;
  buyer_address: string;
  buyer_contact: string;
  make_type: string;
  color: string;
  motor_no: string;
  chassis_no: string;
  completed: boolean;
}

export function EditDealDialog({
  deal,
  salespeople,
  options,
  names,
}: {
  deal: EditableDeal;
  salespeople: { salespersonId: string; percent: number }[];
  options: SalespersonOption[];
  names: [string, string][];
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SalesRow[]>(() => rowsFromDeal(salespeople));
  const [state, action, pending] = useDialogAction(editDeal, () => setOpen(false));
  const nameMap = useMemo(() => new Map(names), [names]);
  // A sold deal always needs someone credited; an open one may have nobody yet.
  const rowErrors = validateRows(rows, { active: options, names: nameMap }, deal.completed);

  const field = (name: keyof EditableDeal, label: string, required = false) => (
    <div className="space-y-1.5">
      <Label htmlFor={`edit-${name}`}>{label}</Label>
      <Input
        id={`edit-${name}`}
        name={name}
        defaultValue={String(deal[name])}
        required={required}
        className="h-12 text-base"
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="h-12 flex-1" />}>Edit details</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit deal details</DialogTitle>
          <DialogDescription>Changes are recorded in the audit log. The price and plate can&apos;t be changed here.</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <input type="hidden" name="dealId" value={deal.id} />
          <input type="hidden" name="salespeople" value={JSON.stringify(rowErrors.length === 0 ? toPayload(rows) : [])} />
          {field("buyer_name", "Buyer's name", true)}
          {field("buyer_address", "Address")}
          {field("buyer_contact", "Contact no.")}
          {field("make_type", "Make / Type")}
          {field("color", "Color")}
          {field("motor_no", "Motor No.")}
          {field("chassis_no", "Chassis No.")}
          <SalespeopleSection
            rows={rows}
            options={options}
            names={nameMap}
            required={deal.completed}
            errors={rowErrors}
            onChange={setRows}
          />
          <FormError state={state} />
          <Button type="submit" disabled={pending || rowErrors.length > 0} className="h-12 w-full text-base">
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
