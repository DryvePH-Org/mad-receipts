"use client";

import { useActionState, useMemo, useState } from "react";
import { Pencil, Ban } from "lucide-react";
import { toast } from "sonner";
import { SalespeopleSection, type SalespersonOption } from "@/components/salespeople-section";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
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
  "w-full rounded-lg border border-input bg-transparent p-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm";

/** Buttons at the bottom of a form: stacked on phones (main action on top), side by side from sm. */
function Footer({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{children}</div>;
}

export function VoidReceiptDialog({ receiptId, receiptNo }: { receiptId: string; receiptNo: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useDialogAction(voidReceipt, () => setOpen(false));

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => setOpen(true)}>
        Void
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={`Void receipt No. ${receiptNo}`}
        description="The receipt stays on record, marked voided. The deal's totals, status and the unit's status are worked out again, and the sheet and Telegram group are updated."
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="receiptId" value={receiptId} />
          <div className="space-y-2">
            <Label htmlFor={`void-${receiptId}`}>Reason</Label>
            <textarea id={`void-${receiptId}`} name="reason" required minLength={3} maxLength={300} rows={3} className={textarea} />
          </div>
          <FormError state={state} />
          <Footer>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Keep receipt
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Voiding…" : "Void this receipt"}
            </Button>
          </Footer>
        </form>
      </ResponsiveDialog>
    </>
  );
}

export function CancelDealDialog({ dealId, plate, paid }: { dealId: string; plate: string; paid: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useDialogAction(cancelDeal, () => setOpen(false));

  return (
    <>
      <Button type="button" variant="outline" className="w-full text-destructive" onClick={() => setOpen(true)}>
        <Ban /> Cancel deal
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={`Cancel the deal for ${plate}`}
        description="The buyer backs out. The unit goes back to Available and the Telegram group is told. Receipts stay on record."
      >
        <form action={action} className="space-y-4">
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
          <Footer>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Keep deal
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Cancelling…" : "Cancel this deal"}
            </Button>
          </Footer>
        </form>
      </ResponsiveDialog>
    </>
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

  const field = (name: keyof EditableDeal, label: string, required = false, wide = false) => (
    <div className={wide ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
      <Label htmlFor={`edit-${name}`}>{label}</Label>
      <Input id={`edit-${name}`} name={name} defaultValue={String(deal[name])} required={required} />
    </div>
  );

  return (
    <>
      <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <Pencil /> Edit details
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title="Edit deal details"
        description="Changes are recorded in the audit log. The price and plate can't be changed here."
        className="sm:max-w-xl"
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="dealId" value={deal.id} />
          <input type="hidden" name="salespeople" value={JSON.stringify(rowErrors.length === 0 ? toPayload(rows) : [])} />
          <div className="grid gap-4 sm:grid-cols-2">
            {field("buyer_name", "Buyer's name", true, true)}
            {field("buyer_address", "Address", false, true)}
            {field("buyer_contact", "Contact no.")}
            {field("make_type", "Make / Type")}
            {field("color", "Color")}
            {field("motor_no", "Motor No.")}
            {field("chassis_no", "Chassis No.", false, true)}
          </div>
          <SalespeopleSection rows={rows} options={options} names={nameMap} required={deal.completed} errors={rowErrors} onChange={setRows} />
          <FormError state={state} />
          <Footer>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || rowErrors.length > 0}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </Footer>
        </form>
      </ResponsiveDialog>
    </>
  );
}
