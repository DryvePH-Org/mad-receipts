"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis, LogOut, Send } from "lucide-react";
import { InstallButton } from "@/components/pwa/install-button";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/auth-actions";
import { isActivePath, tabBarItems, type ModuleId, type Role } from "@/lib/navigation";
import { cn } from "@/lib/utils";

interface Props {
  role: Role;
  /** the menu items this person has: their role's, plus or minus what the Admin changed */
  modules: ModuleId[];
  name: string;
  /** a number to show beside a menu entry (how many are waiting) */
  badges?: Partial<Record<ModuleId, number>>;
}

/**
 * The phone and tablet tab bar (below 1024 px): the first four menu items, and a "More" sheet for the
 * rest plus the account actions. It keeps clear of the iPhone home indicator.
 */
export function BottomTabBar(props: Props) {
  return (
    <Suspense fallback={<View {...props} pathname={null} />}>
      <ActiveView {...props} />
    </Suspense>
  );
}

function ActiveView(props: Props) {
  return <View {...props} pathname={usePathname()} />;
}

const tab =
  "flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors outline-none focus-visible:bg-muted";

function View({ role, modules, name, badges = {}, pathname }: Props & { pathname: string | null }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { tabs, more } = tabBarItems(role, modules);
  const moreActive = more.some((item) => isActivePath(item.href, pathname));

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden"
      >
        <ul className="mx-auto flex h-16 max-w-xl items-stretch">
          {tabs.map((item) => {
            const active = isActivePath(item.href, pathname);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(tab, active ? "text-foreground" : "text-muted-foreground")}
                >
                  <span className="relative"><item.icon className={cn("size-5", active && "stroke-[2.5]")} aria-hidden />{!!badges[item.id] && <span className="absolute -top-1.5 -right-2.5 min-w-4 rounded-full bg-amber-500 px-1 text-center text-[10px] leading-4 font-semibold text-white tabular-nums">{badges[item.id]}</span>}</span>
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={cn(tab, moreActive ? "text-foreground" : "text-muted-foreground")}
            >
              <span className="relative"><Ellipsis className="size-5" aria-hidden />{more.some((i) => !!badges[i.id]) && <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-amber-500" />}</span>
              More
            </button>
          </li>
        </ul>
      </nav>

      <ResponsiveDialog open={moreOpen} onOpenChange={setMoreOpen} title="More" description={name}>
        <div className="space-y-4">
          {more.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {more.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    aria-current={isActivePath(item.href, pathname) ? "page" : undefined}
                    className="flex items-center gap-3 px-3 py-3 text-sm font-medium"
                  >
                    <item.icon className="size-5 text-muted-foreground" aria-hidden />
                    {item.label}
                    {!!badges[item.id] && <span className="ml-auto rounded-full bg-amber-500 px-2 text-xs font-semibold text-white tabular-nums">{badges[item.id]}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Button variant="outline" className="w-full" nativeButton={false} onClick={() => setMoreOpen(false)} render={<Link href="/telegram" />}><Send /> My Telegram</Button>
          <InstallButton className="w-full" />
          <form action={logout}>
            <Button type="submit" variant="outline" className="w-full">
              <LogOut /> Log out
            </Button>
          </form>
        </div>
      </ResponsiveDialog>
    </>
  );
}
