import { ArrowDown, Check } from "lucide-react";
import type { StageModel } from "@/lib/docs/stage";

/** Where the car is, and the one thing to do next. The same on every visit, so a new person always knows what comes next. */
export function StageCard({ stage }: { stage: StageModel }) {
  const { steps, next } = stage;
  const inSteps = steps.filter((s) => s.group === "in"), outSteps = steps.filter((s) => s.group === "out");
  const bar = (list: typeof steps, label: string) => (
    <div className="min-w-0 flex-1">
      <p className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <ol className="flex flex-wrap gap-x-1 gap-y-2">
        {list.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1" aria-current={s.state === "current" ? "step" : undefined}>
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.state === "done" ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200" : s.state === "current" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {s.state === "done" ? <Check className="size-3" aria-hidden /> : <span className="grid size-4 place-items-center rounded-full bg-background/20 text-[10px]" aria-hidden>{i + 1 + (s.group === "out" ? 4 : 0)}</span>}
              {s.label}<span className="sr-only">{s.state === "done" ? " (done)" : s.state === "current" ? " (now)" : " (later)"}</span>
            </span>
            {i < list.length - 1 && <span className="h-px w-3 bg-border" aria-hidden />}
          </li>
        ))}
      </ol>
    </div>
  );
  return (
    <section className="space-y-4 rounded-xl p-4 ring-1 ring-foreground/10 sm:p-5" aria-label="Where this car is">
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-8">{bar(inSteps, "When the car comes in")}{bar(outSteps, "When it is sold")}</div>
      <div className="flex items-start gap-3 rounded-lg bg-primary/5 p-3 ring-1 ring-primary/20">
        <ArrowDown className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium tracking-wide text-primary uppercase">Do this next</p>
          <p className="font-medium">{next.title}</p>
          {next.body && <p className="mt-0.5 text-sm text-muted-foreground">{next.body}</p>}
          {next.anchor && <a href={`#${next.anchor}`} className="mt-1 inline-block text-sm underline underline-offset-2">Go there</a>}
        </div>
      </div>
    </section>
  );
}
