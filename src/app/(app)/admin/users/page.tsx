import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Pill } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import type { FundAssignmentOption } from "@/components/pcf/admin/types";
import { PCF_ROLE_LABELS, effectivePcfRole, type Role } from "@/lib/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccessDialog } from "./access-dialog";
import { ActiveToggle } from "./active-toggle";
import { AddUserButton } from "./add-user-button";
import { FundsButton } from "./funds-button";
import { PcfRoleSelect } from "./pcf-role-select";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { RoleSelect } from "./role-select";

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Create accounts, choose each person's role, PCF role and the modules they can open, reset passwords and disable accounts. Nobody can sign up on their own." actions={<AddUserButton />} />
      <Suspense fallback={<PageSkeleton />}>
        <UsersContent />
      </Suspense>
    </div>
  );
}

/** An account is switched off while its ban date is in the future. */
const isBanned = (until?: string | null) => !!until && Date.parse(until) > Date.now();

async function UsersContent() {
  const me = await requireAdmin();

  const admin = createAdminClient();
  const [{ data: authUsers, error }, base, extra, pcfProfiles, funds, links] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("profiles").select("id, full_name, role"),
    admin.from("profiles").select("id, module_grants, module_denies"),
    admin.from("profiles").select("id, pcf_role"),
    admin.from("funds").select("id, name, amount, is_active").order("name"),
    admin.from("fund_custodians").select("fund_id, custodian_id"),
  ]);
  if (error) return <p className="text-destructive">Could not load users.</p>;

  const profileById = new Map((base.data ?? []).map((p) => [p.id, p]));
  // Without the latest database update the access columns do not exist: the page still works, without the Access buttons.
  const accessReady = !extra.error;
  const accessById = new Map((extra.data ?? []).map((p) => [p.id, p]));
  // PCF: each person's own PCF role, and the funds custodians hold.
  const pcfReady = !pcfProfiles.error && !funds.error && !links.error;
  const pcfById = new Map((pcfProfiles.data ?? []).map((p) => [p.id, p.pcf_role]));
  const heldCount = new Map<string, number>();
  const custodiansOf = new Map<string, string[]>();
  for (const link of links.data ?? []) {
    heldCount.set(link.custodian_id, (heldCount.get(link.custodian_id) ?? 0) + 1);
    custodiansOf.set(link.fund_id, [...(custodiansOf.get(link.fund_id) ?? []), link.custodian_id]);
  }
  const nameById = new Map((base.data ?? []).map((p) => [p.id, p.full_name ?? ""]));
  const fundOptions: FundAssignmentOption[] = (funds.data ?? [])
    .filter((fund) => fund.is_active)
    .map((fund) => ({
      id: fund.id,
      name: fund.name,
      amount: String(fund.amount),
      custodian_ids: custodiansOf.get(fund.id) ?? [],
      custodian_names: (custodiansOf.get(fund.id) ?? []).map((id) => nameById.get(id) || "—"),
    }));
  const users = authUsers.users
    .map((u) => {
      const profile = profileById.get(u.id), access = accessById.get(u.id);
      return {
        id: u.id, email: u.email ?? "", name: profile?.full_name ?? u.email ?? "", role: (profile?.role ?? "sales") as Role,
        grants: access?.module_grants ?? [], denies: access?.module_denies ?? [],
        disabled: isBanned(u.banned_until),
        pcfRole: pcfById.get(u.id) ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Card>
      <CardHeader>
        <CardTitle>All users ({users.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!pcfReady && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">PCF roles need the PCF database update (migration 19).</p>}
        {!accessReady && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">Per-person access needs the latest database update (migration 18). Roles still work.</p>}
        <ul className="-my-2 divide-y">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{u.name}</p>
                <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {u.role === "admin" ? <Badge>Admin</Badge> : u.role === "approver" ? <Pill tone="purple">Approver</Pill> : u.role === "documentation" ? <Pill tone="blue">Documentation</Pill> : <Pill tone="grey">Sales</Pill>}
                  {(() => {
                    const pcf = effectivePcfRole(u.role, u.pcfRole);
                    return pcf && <Pill tone="teal">PCF: {PCF_ROLE_LABELS[pcf]}</Pill>;
                  })()}
                  {u.disabled && <Pill tone="red">Disabled</Pill>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <RoleSelect userId={u.id} role={u.role} />
                {pcfReady && <PcfRoleSelect userId={u.id} pcfRole={u.pcfRole} isAdmin={u.role === "admin"} self={u.id === me.id} />}
                {pcfReady && u.pcfRole === "custodian" && <FundsButton user={{ id: u.id, full_name: u.name }} funds={fundOptions} held={heldCount.get(u.id) ?? 0} />}
                {accessReady && <AccessDialog userId={u.id} name={u.name} role={u.role} grants={u.grants} denies={u.denies} locked={u.id === me.id} />}
                <ResetPasswordDialog userId={u.id} name={u.name} />
                <ActiveToggle userId={u.id} name={u.name} active={!u.disabled} self={u.id === me.id} />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
