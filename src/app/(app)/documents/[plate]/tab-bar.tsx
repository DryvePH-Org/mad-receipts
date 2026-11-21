"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { TAB_OF_ANCHOR } from "./tabs";

export interface TabItem { key: string; label: string; badge?: string | null; tone?: "amber" | "emerald" | "zinc" }

const TONE = { amber: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200", emerald: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200", zinc: "bg-muted text-muted-foreground" };

/** The tabs of the car's page: real links (the address says which tab, so a link can be shared), scrolling sideways on a phone, and under the page header while you scroll. */
export function TabBar({ tabs, active }: { tabs: TabItem[]; active: string }) {
  const path = usePathname(), router = useRouter(), params = useSearchParams();
  // a link to a part of the page (…#transfer) opens the tab that holds it
  useEffect(() => {
    const go = () => {
      const id = window.location.hash.slice(1);
      const tab = TAB_OF_ANCHOR[id];
      if (tab && tab !== params.get("tab") && tabs.some((t) => t.key === tab)) router.replace(`${path}?tab=${tab}#${id}`, { scroll: false });
      else if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    };
    go();
    window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, [path, params, router, tabs]);
  return (
    <nav aria-label="The car's page" className="sticky top-14 z-20 -mx-4 border-b bg-background/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-8 lg:px-8">
      <ul role="tablist" className="flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <li key={t.key} role="presentation" className="shrink-0">
            <Link role="tab" aria-selected={active === t.key} href={`${path}?tab=${t.key}`} replace scroll={false}
              className={cn("flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors", active === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t.label}
              {t.badge && <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] leading-none font-medium", TONE[t.tone ?? "zinc"])}>{t.badge}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
