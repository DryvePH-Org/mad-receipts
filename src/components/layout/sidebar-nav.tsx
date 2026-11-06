"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { InstallButton } from "@/components/pwa/install-button";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/auth-actions";
import { isActivePath, navGroups, ROLE_LABELS, type ModuleId, type Role } from "@/lib/navigation";
import { cn } from "@/lib/utils";

interface Props {
  role: Role;
  /** the menu items this person has: their role's, plus or minus what the Admin changed */
  modules: ModuleId[];
  name: string;
}

/** The desktop sidebar (from 1024 px): logo, menu groups, and the signed-in user. */
export function SidebarNav(props: Props) {
  // usePathname needs a Suspense boundary so pages can still be prepared ahead of time.
  return (
    <Suspense fallback={<View {...props} pathname={null} />}>
      <ActiveView {...props} />
    </Suspense>
  );
}

function ActiveView(props: Props) {
  return <View {...props} pathname={usePathname()} />;
}

function View({ role, modules, name, pathname }: Props & { pathname: string | null }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Brand />
      </div>

      <nav aria-label="Primary" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {navGroups(role, modules).map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              {group.label}
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const active = isActivePath(item.href, pathname);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <item.icon className="size-5" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-3 border-t p-4">
        <InstallButton className="w-full" />
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{name}</p>
            <Badge variant={role === "admin" ? "default" : "secondary"} className="mt-0.5">
              {ROLE_LABELS[role]}
            </Badge>
          </div>
          <div className="flex items-center">
            <ThemeToggle />
            <form action={logout}>
              <Button type="submit" variant="ghost" size="icon" aria-label="Log out">
                <LogOut />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
