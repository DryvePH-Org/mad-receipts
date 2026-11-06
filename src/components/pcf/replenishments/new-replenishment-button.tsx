"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { createReplenishment } from "@/lib/pcf/actions/replenishments";
import { ResponsiveDialog } from "@/components/pcf/shared/responsive-dialog";
import type { ReplenishmentFundOption } from "@/components/pcf/replenishments/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPHP } from "@/lib/pcf/money";

export function NewReplenishmentButton({
  funds,
}: {
  funds: ReplenishmentFundOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fundId, setFundId] = useState(funds[0]?.fund_id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const items = funds.map((fund) => ({
    value: fund.fund_id,
    label: `${fund.fund_name} · ${fund.voucher_count} ${
      fund.voucher_count === 1 ? "voucher" : "vouchers"
    } · ${formatPHP(fund.total)}`,
  }));

  async function create() {
    setPending(true);
    setError(null);
    try {
      const result = await createReplenishment({ fund_id: fundId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Replenishment draft created.");
      setOpen(false);
      router.push(`/pcf/replenishments/${result.id}`);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Something went wrong.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={funds.length === 0}
        title={
          funds.length === 0
            ? "No released, approved, or flagged vouchers are waiting to be replenished."
            : undefined
        }
      >
        <Plus />
        New replenishment
      </Button>

      {open ? (
        <ResponsiveDialog
          open
          onOpenChange={(next) => {
            if (!next) setOpen(false);
          }}
          title="New replenishment"
          description="This bundles every released, approved, and flagged voucher that is not yet in a request. The fund stays as it is until the request is reviewed and closed."
        >
          <div className="space-y-2">
            <Label htmlFor="replenishment-fund">Fund</Label>
            <Select
              value={fundId}
              onValueChange={(value) => setFundId(value ?? "")}
              items={items}
              disabled={funds.length <= 1 || pending}
            >
              <SelectTrigger
                id="replenishment-fund"
                className="w-full"
                aria-invalid={Boolean(error)}
              >
                <SelectValue placeholder="Select a fund" />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
          <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={create}
              disabled={pending || !fundId}
            >
              {pending ? "Creating..." : "Create draft"}
            </Button>
          </div>
        </ResponsiveDialog>
      ) : null}
    </>
  );
}
