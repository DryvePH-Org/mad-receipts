import { Suspense } from "react";
import Link from "next/link";
import { CircleCheck, Clock, FileText, Landmark, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { remindersFor } from "@/lib/data";
import type { Notification } from "@/lib/deal/status";
import { ROLE_LABELS } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { SendReminderButton } from "./send-buttons";

const ICONS = { warn: TriangleAlert, clock: Clock, bank: Landmark, file: FileText, shield: ShieldCheck, x: X } as const;
const TONE = { red: "bg-red-100 text-red-800", amber: "bg-amber-100 text-amber-800", blue: "bg-teal-100 text-teal-800", purple: "bg-violet-100 text-violet-800" } as const;

export default function RemindersPage() {
  return <Suspense fallback={<PageSkeleton />}><Content /></Suspense>;
}

function Group({ title, items }: { title: string; items: Notification[] }) {
  if (!items.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">{title}</h2>
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10">
        {items.map((n) => {
          const Icon = ICONS[n.icon];
          return (
            <div key={n.key} className="flex items-start gap-3 border-t p-4 first:border-t-0">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", TONE[n.level])}><Icon className="size-4" aria-hidden /></span>
              <div className="min-w-0 flex-1"><p className="font-medium">{n.title}</p><p className="text-sm text-muted-foreground">{n.detail}</p></div>
              <div className="flex flex-col items-end gap-1.5"><SendReminderButton itemKey={n.key} /><Button size="sm" variant="ghost" nativeButton={false} render={<Link href={`/deals/${n.dealId}`} />}>Open deal</Button></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

async function Content() {
  const user = await requireUser();
  const list = await remindersFor(user);
  return (
    <div className="space-y-6">
      <PageHeader title="Reminders" description={`What needs a nudge, for ${user.fullName ?? user.email} (${ROLE_LABELS[user.role]}). Reminders also go to Telegram every morning at 8:00.`}
        actions={list.length > 0 ? <SendReminderButton label="Send all to Telegram" /> : undefined} />
      <div className="max-w-4xl space-y-6">
        {list.length === 0 ? <EmptyState icon={CircleCheck} title="Nothing needs attention" description="Overdue deals, deals due soon, loans waiting too long and receipts waiting for approval show up here." /> : (
          <>
            <Group title="Needs action now" items={list.filter((n) => n.level === "red")} />
            <Group title="Coming up" items={list.filter((n) => n.level === "amber" || n.level === "blue")} />
            <Group title="Waiting for approval" items={list.filter((n) => n.level === "purple")} />
          </>
        )}
        {user.role === "admin" && <p className="text-sm text-muted-foreground">The Admin sets when reminders go out in <Link href="/settings" className="underline">Settings</Link>.</p>}
      </div>
    </div>
  );
}
