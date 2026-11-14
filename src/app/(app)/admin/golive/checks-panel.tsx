"use client";

import { useState, useTransition } from "react";
import { CircleAlert, CircleCheck, CircleX, Info, Loader2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Check, CheckStatus } from "@/lib/golive/checks";
import { runChecksAction } from "./actions";

const ICON: Record<CheckStatus, React.ReactNode> = {
  pass: <CircleCheck className="size-4 text-emerald-700 dark:text-emerald-400" aria-label="OK" />,
  warn: <CircleAlert className="size-4 text-amber-700 dark:text-amber-400" aria-label="Look at this" />,
  fail: <CircleX className="size-4 text-red-700 dark:text-red-400" aria-label="Problem" />,
  info: <Info className="size-4 text-muted-foreground" aria-label="Information" />,
};

export function ChecksPanel() {
  const [busy, start] = useTransition();
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [at, setAt] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const run = () => start(async () => { setProblem(null); const r = await runChecksAction(); if (r.ok) { setChecks(r.checks); setAt(r.at); } else setProblem(r.message); });
  const areas = checks ? [...new Set(checks.map((c) => c.area))] : [];
  const count = (s: CheckStatus) => checks?.filter((c) => c.status === s).length ?? 0;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <PlayCircle />} Run the checks</Button>
        {busy && <span className="text-sm text-muted-foreground">Looking at the sheets, the database and Drive… this takes up to half a minute.</span>}
        {checks && !busy && <span className="text-sm text-muted-foreground">{count("fail")} problem{count("fail") === 1 ? "" : "s"}, {count("warn")} to look at, {count("pass")} fine · {at ? new Date(at).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" }) : ""}</span>}
      </div>
      {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
      {areas.map((area) => (
        <section key={area} className="space-y-2">
          <h2 className="text-sm font-medium">{area}</h2>
          <ul className="divide-y rounded-xl ring-1 ring-foreground/10">
            {checks!.filter((c) => c.area === area).map((c, i) => (
              <li key={`${c.title}-${i}`} className="flex gap-3 px-4 py-3 text-sm">
                <span className="mt-0.5 shrink-0">{ICON[c.status]}</span>
                <div className="min-w-0 flex-1"><p className="font-medium">{c.title}</p><p className="break-words text-muted-foreground">{c.detail}</p>{c.hint && <p className="mt-1 text-amber-800 dark:text-amber-300">{c.hint}</p>}</div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
