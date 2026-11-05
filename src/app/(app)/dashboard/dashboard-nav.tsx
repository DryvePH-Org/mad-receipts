"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { refreshDashboardAction } from "./actions";

const TABS = [{ href: "/dashboard/buy", label: "Buy" }, { href: "/dashboard/sell", label: "Sell / Online marketing" }];

/** Buy and Sell side by side as two dashboards, and the button that reads the sheets again right now. */
export function DashboardNav({ buyUrl, sellUrl }: { buyUrl: string; sellUrl: string }) {
  const path = usePathname();
  const [pending, start] = useTransition();
  const [at, setAt] = useState<Date | null>(null);
  const sheet = path?.startsWith("/dashboard/sell") ? sellUrl : buyUrl;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <nav aria-label="Dashboards" className="inline-flex rounded-lg bg-muted p-0.5">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} aria-current={path?.startsWith(t.href) ? "page" : undefined}
            className={cn("rounded-md px-4 py-1.5 text-sm font-medium", path?.startsWith(t.href) ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>{t.label}</Link>
        ))}
      </nav>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {at && <span className="text-xs text-muted-foreground">Refreshed {at.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}</span>}
        <Button type="button" variant="outline" size="sm" nativeButton={false} render={<a href={sheet} target="_blank" rel="noreferrer" />}>Open the sheet</Button>
        <Button type="button" size="sm" disabled={pending} onClick={() => start(async () => { try { const r = await refreshDashboardAction(); setAt(new Date(r.at)); } catch { toast.error("Could not refresh. Try again."); } })}>
          {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh now</Button>
      </div>
    </div>
  );
}
