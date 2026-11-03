import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Pill } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateUserForm } from "./create-user-form";
import { ResetPasswordDialog } from "./reset-password-dialog";

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Users" description="Create staff accounts and reset passwords. Nobody can sign up on their own." />
      <Suspense fallback={<PageSkeleton />}>
        <UsersContent />
      </Suspense>
    </div>
  );
}

async function UsersContent() {
  await requireAdmin();

  const admin = createAdminClient();
  const [{ data: authUsers, error }, { data: profiles }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("profiles").select("id, full_name, role"),
  ]);
  if (error) return <p className="text-destructive">Could not load users.</p>;

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const users = authUsers.users
    .map((u) => {
      const profile = profileById.get(u.id);
      return { id: u.id, email: u.email ?? "", name: profile?.full_name ?? u.email ?? "", role: profile?.role ?? "staff" };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
      <Card>
        <CardHeader>
          <CardTitle>Add staff user</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateUserForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All users ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="-my-2 divide-y">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{u.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                  <div className="mt-1">
                    {u.role === "admin" ? <Badge>Admin</Badge> : <Pill tone="grey">Staff</Pill>}
                  </div>
                </div>
                <ResetPasswordDialog userId={u.id} name={u.name} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
