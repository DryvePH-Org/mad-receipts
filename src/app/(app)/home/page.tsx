import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireModule } from "@/lib/auth";
import { loadAttention, type Tile } from "@/lib/home/attention";
import { sortWork } from "@/lib/home/work";
import { loadMyWork } from "@/lib/home/work-server";
import { ROLE_LABELS } from "@/lib/navigation";
import { WorkBoard } from "./work-board";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageSkeleton />}><Content /></Suspense>
    </div>
  );
}

const TONE: Record<Tile["tone"], string> = {
  zinc: "text-foreground", amber: "text-amber-700 dark:text-amber-300", red: "text-destructive", emerald: "text-emerald-700 dark:text-emerald-300", blue: "text-blue-700 dark:text-blue-300",
};

async function Content() {
  const user = await requireModule("home");
  const now = new Date();
  const [work, tiles] = await Promise.all([loadMyWork(user.id, now).catch(() => []), loadAttention(user.role, user.modules, now).catch(() => [])]);
  const { open, done } = sortWork(work);
  const first = (user.fullName ?? user.email).split(/\s+/)[0];
  return (
    <>
      <PageHeader title={`Hi, ${first}`} description={`${ROLE_LABELS[user.role]} · your own home: what you are working on and what needs you.`} />
      <WorkBoard open={open} done={done} nowIso={now.toISOString()} />
      {tiles.length > 0 && (
        <section className="space-y-3" aria-label="Needs my attention">
          <h2 className="text-base font-medium">Needs my attention</h2>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {tiles.map((t) => (
              <li key={t.key}>
                <Link href={t.href} className="flex h-full flex-col gap-1 rounded-xl p-4 ring-1 ring-foreground/10 transition hover:bg-muted/40 focus-visible:bg-muted/40">
                  <span className={`text-3xl font-semibold tabular-nums ${TONE[t.tone]}`}>{t.value}</span>
                  <span className="text-sm font-medium">{t.label}</span>
                  <span className="text-xs text-muted-foreground">{t.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
