import { LiveRefresh } from "@/components/layout/live-refresh";
import { Brand } from "@/components/layout/brand";
import { BottomTabBar } from "@/components/layout/bottom-tab-bar";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Badge } from "@/components/ui/badge";
import type { CurrentUser } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/navigation";

/**
 * Wraps every signed-in page. From 1024 px: a fixed sidebar. Below that: a top bar and a bottom
 * tab bar. The content is centred in a 72 rem column and cleared of the fixed bars.
 */
export function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const name = user.fullName ?? user.email;

  return (
    <div className="min-h-svh bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-sidebar lg:block print:hidden">
        <SidebarNav role={user.role} modules={user.modules} name={name} />
      </aside>

      <div className="lg:pl-64 print:pl-0">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6 lg:hidden print:hidden">
          <Brand tagline={false} />
          <div className="flex min-w-0 items-center gap-1">
            <span className="max-w-32 truncate text-sm font-medium sm:max-w-48">{name}</span>
            <Badge variant={user.role === "admin" ? "default" : "secondary"}>{ROLE_LABELS[user.role]}</Badge>
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-safe-bar sm:px-6 lg:px-8 lg:py-10 lg:pb-10 print:max-w-none print:p-0">
          <LiveRefresh />
          {children}
        </main>
      </div>

      <BottomTabBar role={user.role} modules={user.modules} name={name} />
    </div>
  );
}
