"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check } from "lucide-react";

// Screens that show other people's work (approvals, balances, the log) keep themselves up to date. Every few seconds a tiny check
// asks "did anything change?"; only when it did does the screen reload its data, with a thin bar at the top while it does.
// Your typing is kept, and the form pages are left alone.
const WATCHED = ["/deals", "/approvals", "/reminders", "/activity", "/admin"];
const EVERY_MS = 8_000;

export function LiveRefresh() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [pending, start] = useTransition();
  const [fresh, setFresh] = useState(false);
  const seen = useRef<string | null>(null);
  const busy = useRef(false);
  const watched = WATCHED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  useEffect(() => {
    if (!watched) return;
    let stop = false;
    async function check() {
      if (stop || busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      try {
        const res = await fetch("/api/pulse", { cache: "no-store" });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v: string };
        const changed = seen.current !== null && seen.current !== v;
        seen.current = v;
        if (changed) { start(() => router.refresh()); setFresh(true); setTimeout(() => setFresh(false), 2500); }
      } catch { /* offline or a hiccup: try again at the next turn */ } finally { busy.current = false; }
    }
    check();
    const timer = setInterval(check, EVERY_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => { stop = true; clearInterval(timer); document.removeEventListener("visibilitychange", check); window.removeEventListener("focus", check); };
  }, [watched, router, pathname]);

  if (!watched) return null;
  return (
    <>
      <div aria-hidden className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity ${pending ? "opacity-100" : "opacity-0"}`}>
        <div className="h-full w-1/3 animate-[live-bar_1s_ease-in-out_infinite] bg-primary" />
      </div>
      <p role="status" aria-live="polite" className={`pointer-events-none fixed right-4 bottom-24 z-40 flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900 shadow-sm ring-1 ring-emerald-200 transition-opacity lg:bottom-6 ${pending || fresh ? "opacity-100" : "opacity-0"}`}>
        <Check className="size-3.5" aria-hidden />{pending ? "Updating…" : "Updated"}
      </p>
    </>
  );
}
