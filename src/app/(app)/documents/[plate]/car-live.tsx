"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { rescanAction } from "../actions";

/** Keeps the page up to date while the bots work (a look every few seconds), and lists a never-opened folder's files the first time the car is opened. */
export function CarLive({ plate, linked, scanned, busy }: { plate: string; linked: boolean; scanned: boolean; busy: boolean }) {
  const router = useRouter();
  const asked = useRef(false);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [busy, router]);
  useEffect(() => {
    if (!linked || scanned || asked.current) return;
    asked.current = true;
    void rescanAction(plate).then((r) => { if (!r.ok) toast.error(r.message); router.refresh(); });
  }, [linked, scanned, plate, router]);
  return null;
}
