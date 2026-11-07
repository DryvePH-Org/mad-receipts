"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

// Screens that show other people's work (approvals, balances, the log). They are brought up to date when you come back to the
// tab, and once a minute while you look at them. Your typing is kept; the form pages are left alone.
const WATCHED = ["/deals", "/approvals", "/reminders", "/cash", "/activity", "/admin"];
const MIN_GAP_MS = 20_000;

export function LiveRefresh() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const last = useRef(0);
  const watched = WATCHED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    if (!watched) return;
    last.current = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - last.current < MIN_GAP_MS) return;
      last.current = Date.now();
      router.refresh();
    };
    const timer = setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("focus", refresh); };
  }, [watched, router, pathname]);

  return null;
}
