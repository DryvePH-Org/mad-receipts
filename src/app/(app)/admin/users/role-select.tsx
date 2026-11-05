"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { NativeSelect } from "@/components/ui/native-select";
import { changeRole } from "./actions";

export function RoleSelect({ userId, role }: { userId: string; role: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="w-32">
      <NativeSelect aria-label="Role" value={role} disabled={pending} onChange={(e) => start(async () => { const r = await changeRole(userId, e.target.value); if (r.ok) toast.success(r.message); else toast.error(r.message); })}>
        <option value="sales">Sales</option>
        <option value="approver">Approver</option>
        <option value="admin">Admin</option>
      </NativeSelect>
    </div>
  );
}
