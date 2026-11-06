"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AssignFundsDialog } from "@/components/pcf/admin/assign-funds-dialog";
import type { FundAssignmentOption } from "@/components/pcf/admin/types";
import { Button } from "@/components/ui/button";

/** Which PCF funds a custodian holds. */
export function FundsButton({ user, funds, held }: { user: { id: string; full_name: string }; funds: FundAssignmentOption[]; held: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>{held > 0 ? `Funds (${held})` : "Assign funds"}</Button>
      {open && (
        <AssignFundsDialog
          open
          user={user}
          funds={funds}
          onOpenChange={setOpen}
          onSaved={() => {
            toast.success("Funds updated");
            router.refresh();
          }}
        />
      )}
    </>
  );
}
