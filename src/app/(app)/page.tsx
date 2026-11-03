import { Suspense } from "react";
import Link from "next/link";
import { Camera, CircleCheck, Clock, FileCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DueBadge } from "@/components/shared/due-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Pill, ReceiptStatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { addDays, formatDate, manilaToday, monthStart } from "@/lib/dates";
import { paymentTypeLabel } from "@/lib/deals";
import { createClient } from "@/lib/supabase/server";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof Clock; value: number; label: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-3xl leading-none font-semibold tracking-tight tabular-nums">{value}</p>
          <p className="mt-1 text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

async function DashboardContent() {
  const user = await requireUser();
  const supabase = await createClient();
  const today = manilaToday();
  const monthStartManila = `${monthStart(today)}T00:00:00+08:00`;

  const [open, soldThisMonth, due, recent] = await Promise.all([
    supabase.from("deals").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .gte("updated_at", monthStartManila),
    // Balance due within 3 days, or already past.
    supabase
      .from("deal_summaries")
      .select("id, plate_no, buyer_name, balance, next_due_date")
      .eq("status", "open")
      .lte("next_due_date", addDays(today, 3))
      .order("next_due_date", { ascending: true })
      .limit(20),
    supabase.from("receipt_list").select("*").order("created_at", { ascending: false }).limit(8),
  ]);

  if (open.error || soldThisMonth.error || due.error || recent.error) {
    return <p className="text-destructive">Could not load the dashboard. Please try again.</p>;
  }

  const firstName = (user.fullName ?? user.email).split(/[\s@]/)[0];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            Welcome back, {firstName}.
            <Badge variant={user.role === "admin" ? "default" : "secondary"}>{user.role === "admin" ? "Admin" : "Staff"}</Badge>
          </span>
        }
        actions={
          <Button size="lg" nativeButton={false} render={<Link href="/upload" />}>
            <Camera /> Upload receipt
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
        <Stat icon={Clock} value={open.count ?? 0} label="Open deals" />
        <Stat icon={CircleCheck} value={soldThisMonth.count ?? 0} label="Sold this month" />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Due soon or overdue</CardTitle>
          </CardHeader>
          <CardContent>
            {due.data.length === 0 ? (
              <EmptyState icon={CircleCheck} title="All caught up" description="No balances are due in the next 3 days." />
            ) : (
              <ul className="-my-2 divide-y">
                {due.data.map((deal) => (
                  <li key={deal.id}>
                    <Link href={`/deals/${deal.id}`} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="font-medium">{deal.plate_no}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {deal.buyer_name} · <MoneyText value={deal.balance} />
                          {deal.next_due_date && ` · ${formatDate(deal.next_due_date)}`}
                        </p>
                      </div>
                      <DueBadge dueDate={deal.next_due_date} today={today} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent receipts</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.data.length === 0 ? (
              <EmptyState
                icon={FileCheck}
                title="No receipts yet"
                description="Photograph a paper receipt to add the first one."
                action={
                  <Button nativeButton={false} render={<Link href="/upload" />}>
                    <Camera /> Upload receipt
                  </Button>
                }
              />
            ) : (
              <ul className="-my-2 divide-y">
                {recent.data.map((r) => (
                  <li key={r.id}>
                    <Link href={`/deals/${r.deal_id}`} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className={r.status === "voided" ? "font-medium line-through" : "font-medium"}>No. {r.receipt_no}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {r.plate_no} · {r.buyer_name} · <MoneyText value={r.amount} />
                        </p>
                      </div>
                      {r.status === "voided" ? <ReceiptStatusBadge status={r.status} /> : <Pill tone="grey">{paymentTypeLabel(r.payment_type)}</Pill>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
