import { Suspense } from "react";
import Link from "next/link";
import { DueBadge } from "@/components/due-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { addDays, formatDate, manilaToday, monthStart } from "@/lib/dates";
import { paymentTypeLabel, pesos } from "@/lib/deals";
import { createClient } from "@/lib/supabase/server";

export default function DashboardPage() {
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

async function DashboardContent() {
  await requireUser();
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

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="space-y-1 pt-4">
            <p className="text-3xl font-semibold">{open.count ?? 0}</p>
            <p className="text-sm text-muted-foreground">Open deals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 pt-4">
            <p className="text-3xl font-semibold">{soldThisMonth.count ?? 0}</p>
            <p className="text-sm text-muted-foreground">Sold this month</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Due soon or overdue</CardTitle>
        </CardHeader>
        <CardContent>
          {due.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No balances are due in the next 3 days.</p>
          ) : (
            <ul className="divide-y">
              {due.data.map((deal) => (
                <li key={deal.id}>
                  <Link href={`/deals/${deal.id}`} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">{deal.plate_no}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {deal.buyer_name} · {pesos(deal.balance)}
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
            <p className="text-sm text-muted-foreground">No receipts yet. Tap Upload to add the first one.</p>
          ) : (
            <ul className="divide-y">
              {recent.data.map((r) => (
                <li key={r.id}>
                  <Link href={`/deals/${r.deal_id}`} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className={r.status === "voided" ? "font-medium line-through" : "font-medium"}>No. {r.receipt_no}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {r.plate_no} · {r.buyer_name} · {pesos(r.amount)}
                      </p>
                    </div>
                    {r.status === "voided" ? <Badge variant="destructive">Voided</Badge> : <Badge variant="secondary">{paymentTypeLabel(r.payment_type)}</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
