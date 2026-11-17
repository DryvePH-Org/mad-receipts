"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { rescanAction, syncFolderAction } from "../actions";

/**
 * Keeps the page true while people and bots work: every few seconds (while the tab is open on screen) it asks for a fingerprint of everything
 * on the page and reloads when it changed, so a correction by one person, a finished scan or an approval shows for everybody without pressing
 * anything. It also lists a never-opened folder's files the first time the car is opened.
 */
export function CarLive({ plate, linked, scanned, busy, canSync = false }: { plate: string; linked: boolean; scanned: boolean; busy: boolean; canSync?: boolean }) {
  const router = useRouter();
  const asked = useRef(false);
  const seen = useRef<string | null>(null);
  useEffect(() => {
    let stop = false;
    const look = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/docs/car-state/${encodeURIComponent(plate)}`, { cache: "no-store" });
        if (!res.ok || stop) return;
        const { version } = (await res.json()) as { version: string };
        if (seen.current !== null && seen.current !== version) router.refresh();
        seen.current = version;
      } catch { /* a missed look is tried again */ }
    };
    void look();
    const t = setInterval(look, busy ? 3000 : 6000);
    const onShow = () => { if (document.visibilityState === "visible") void look(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", onShow); };
  }, [plate, busy, router]);
  // a quiet look at the Drive folder every minute: photos put in or taken out of the folder by hand show up here (and new ones are scanned)
  useEffect(() => {
    if (!linked || !canSync || !scanned) return;
    const sync = async () => { if (document.visibilityState !== "visible") return; const r = await syncFolderAction(plate).catch(() => null); if (r?.changed) router.refresh(); };
    const first = setTimeout(sync, 3000), t = setInterval(sync, 60_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [linked, canSync, scanned, plate, router]);
  useEffect(() => {
    if (!linked || scanned || asked.current) return;
    asked.current = true;
    void rescanAction(plate).then((r) => { if (!r.ok) toast.error(r.message); router.refresh(); });
  }, [linked, scanned, plate, router]);
  return null;
}
