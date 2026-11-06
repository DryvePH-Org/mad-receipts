"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/ui/native-select";
import { changePcfRole } from "./actions";

/** The PCF role, beside the Invoice role. An Admin with none is still a PCF admin. */
export function PcfRoleSelect({ userId, pcfRole, isAdmin, self }: { userId: string; pcfRole: string | null; isAdmin: boolean; self: boolean }) {
  const [pending, start] = useTransition();
  return (
    <div className="w-48">
      <NativeSelect aria-label="PCF role" value={pcfRole ?? "none"} disabled={pending || self} onChange={(e) => start(async () => { const r = await changePcfRole(userId, e.target.value); if (r.ok) toast.success(r.message); else toast.error(r.message); })}>
        <option value="none">{isAdmin ? "PCF: Admin (by role)" : "PCF: none"}</option>
        <option value="custodian">PCF: Custodian</option>
        <option value="approver">PCF: Approver</option>
        <option value="accounting">PCF: Accounting</option>
        <option value="admin">PCF: Admin</option>
      </NativeSelect>
    </div>
  );
}
