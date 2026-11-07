import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Pill } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireModule } from "@/lib/auth";
import type { Role } from "@/lib/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccessDialog } from "./access-dialog";
import { ActiveToggle } from "./active-toggle";
import { AddUserButton } from "./add-user-button";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { RoleSelect } from "./role-select";

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Create accounts, choose each person's role and the modules they can open, reset passwords and disable accounts. Nobody can sign up on their own." />
      <Suspense fallback={<PageSkeleton />}>
        <UsersContent />
      </Suspense>
    </div>
  );
}

/** An account is switched off while its ban date is in the future. */
const isBanned = (until?: string | null) => !!until && Date.parse(until) > Date.now();

async function UsersContent() {
  const me = await requireModule("users");
  const isAdmin = me.role === "admin";

  const admin = createAdminClient();
  const [{ data: authUsers, error }, base, extra] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("profiles").select("id, full_name, role"),
    admin.from("profiles").select("id, module_grants, module_denies"),
  ]);
  if (error) return <p className="text-destructive">Could not load users.</p>;

  const profileById = new Map((base.data ?? []).map((p) => [p.id, p]));
  // Without the latest database update the access columns do not exist: the page still works, without the Access buttons.
  const accessReady = !extra.error;
  const accessById = new Map((extra.data ?? []).map((p) => [p.id, p]));
  const users = authUsers.users
    .map((u) => {
      const profile = profileById.get(u.id), access = accessById.get(u.id);
      return {
        id: u.id, email: u.email ?? "", name: profile?.full_name ?? u.email ?? "", role: (profile?.role ?? "sales") as Role,
        grants: access?.module_grants ?? [], denies: access?.module_denies ?? [],
        disabled: isBanned(u.banned_until),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">All users ({users.length})<AddUserButton canMakeAdmin={isAdmin} /></CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!accessReady && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">Per-person access needs the latest database update (migration 18). Roles still work.</p>}
        <ul className="-my-2 divide-y">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{u.name}</p>
                <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {u.role === "admin" ? <Badge>Admin</Badge> : u.role === "approver" ? <Pill tone="purple">Approver</Pill> : u.role === "documentation" ? <Pill tone="blue">Documentation</Pill> : <Pill tone="grey">Sales</Pill>}
                  {u.disabled && <Pill tone="red">Disabled</Pill>}
                </div>
              </div>
              {isAdmin || u.role !== "admin" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <RoleSelect userId={u.id} role={u.role} canMakeAdmin={isAdmin} />
                  {isAdmin && accessReady && <AccessDialog userId={u.id} name={u.name} role={u.role} grants={u.grants} denies={u.denies} locked={u.id === me.id} />}
                  <ResetPasswordDialog userId={u.id} name={u.name} />
                  <ActiveToggle userId={u.id} name={u.name} active={!u.disabled} self={u.id === me.id} />
                </div>
              ) : <p className="text-xs text-muted-foreground">Only an Admin can change an Admin.</p>}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
