import Link from "next/link";
import { LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/lib/auth-actions";

export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="min-w-0 text-right leading-tight">
        <p className="truncate text-sm font-medium">{user.fullName ?? user.email}</p>
        {user.role === "admin" ? (
          <Link href="/admin/users">
            <Badge>Admin</Badge>
          </Link>
        ) : (
          <Badge variant="secondary">Staff</Badge>
        )}
      </div>
      <form action={logout}>
        <Button type="submit" variant="ghost" size="icon-lg" aria-label="Log out">
          <LogOut />
        </Button>
      </form>
    </div>
  );
}
