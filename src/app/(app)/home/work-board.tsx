"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { Pill } from "@/components/shared/status-badge";
import { STAGE_LABEL, type WorkItem } from "@/lib/home/work";

const TAB: Record<WorkItem["stage"], string> = { in: "documents", out: "payments", transfer: "sale" };
const ago = (iso: string, now: number) => {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const PILL: Record<string, "zinc" | "blue" | "amber" | "emerald" | "red"> = { zinc: "zinc", blue: "blue", amber: "amber", emerald: "emerald", red: "red" };

/**
 * The person's own work, car by car: where each upload is (sent, waiting in line, being scanned, read, approved). While anything is still moving the page looks again
 * every few seconds, so a scan that finishes shows up without pressing anything; finished work stays below.
 */
export function WorkBoard({ open, done, nowIso }: { open: WorkItem[]; done: WorkItem[]; nowIso: string }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.parse(nowIso));
  const moving = open.some((i) => i.state.active);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    if (!moving) return;
    const look = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 5_000);
    return () => clearInterval(look);
  }, [moving, router]);

  const card = (i: WorkItem) => (
    <li key={`${i.plate}-${i.stage}`}>
      <Link href={`/documents/${i.plate}?tab=${TAB[i.stage]}`} className="block rounded-xl p-4 ring-1 ring-foreground/10 transition hover:bg-muted/40 focus-visible:bg-muted/40">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold tracking-wide">{i.plateDisplay}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{i.car.replace(/\s*\([^)]*\)\s*$/, "")}</span>
          <Pill tone="zinc">{STAGE_LABEL[i.stage]}</Pill>
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
        </div>
        <ol className="mt-3 flex flex-wrap gap-x-1.5 gap-y-1" aria-label="Where it is">
          {i.state.steps.map((s) => (
            <li key={s.key} aria-current={s.state === "now" ? "step" : undefined} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${s.state === "done" ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200" : s.state === "now" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {s.state === "done" ? <Check className="size-3" aria-hidden /> : s.state === "now" && i.state.active ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}{s.label}
            </li>
          ))}
        </ol>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm"><Pill tone={PILL[i.state.tone]}>{i.state.label}</Pill><span className="text-muted-foreground">{i.state.detail}</span></p>
        <p className="mt-1 text-xs text-muted-foreground">{i.photos} {i.photos === 1 ? "photo" : "photos"} · last one {ago(i.lastAt, now)}</p>
      </Link>
    </li>
  );

  return (
    <section className="space-y-3" aria-label="My work right now">
      <h2 className="flex items-center gap-2 text-base font-medium">What I am working on{moving && <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground" role="status"><Loader2 className="size-3 animate-spin" aria-hidden /> updating by itself</span>}</h2>
      {open.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing is waiting right now. Photos you upload on a car&apos;s page show up here while they are scanned, and stay here for three days after they are approved.</p>
      ) : <ul className="space-y-3">{open.map(card)}</ul>}
      {done.length > 0 && (
        <details className="rounded-xl ring-1 ring-foreground/10">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Finished ({done.length})</summary>
          <ul className="space-y-3 border-t p-3">{done.map(card)}</ul>
        </details>
      )}
    </section>
  );
}
