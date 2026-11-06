"use client";

import { useState } from "react";

import { setCustodianFunds } from "@/lib/pcf/actions/users";
import type { FundAssignmentOption } from "@/components/pcf/admin/types";
import { MoneyText } from "@/components/pcf/shared/money-text";
import { ResponsiveDialog } from "@/components/pcf/shared/responsive-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

export function AssignFundsDialog({
  user,
  funds,
  open,
  onOpenChange,
  onSaved,
}: {
  user: { id: string; full_name: string };
  funds: FundAssignmentOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        funds.filter((fund) => fund.custodian_ids.includes(user.id)).map((fund) => fund.id),
      ),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    const result = await setCustodianFunds({
      userId: user.id,
      fundIds: [...selected],
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
    onSaved();
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Funds for ${user.full_name}`}
      description="A custodian only sees and works with the funds ticked here. A fund can have several custodians, so ticking one does not take it from anyone else."
    >
      <div className="space-y-4">
        {funds.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            There are no active funds yet. Create one under PCF → Funds first.
          </p>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {funds.map((fund) => {
              const others = fund.custodian_ids
                .map((id, index) => ({ id, name: fund.custodian_names[index] }))
                .filter((custodian) => custodian.id !== user.id)
                .map((custodian) => custodian.name);
              return (
                <li key={fund.id}>
                  <label
                    htmlFor={`fund-${fund.id}`}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 has-[:checked]:bg-muted/50"
                  >
                    <input
                      id={`fund-${fund.id}`}
                      type="checkbox"
                      className="mt-1 size-4 accent-primary"
                      checked={selected.has(fund.id)}
                      onChange={() => toggle(fund.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{fund.name}</span>
                        <MoneyText
                          value={fund.amount}
                          className="text-sm text-muted-foreground"
                        />
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {others.length > 0
                          ? `Also held by ${others.join(", ")}`
                          : "No other custodian"}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving..." : "Save funds"}
          </Button>
        </DialogFooter>
      </div>
    </ResponsiveDialog>
  );
}
