import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireModule } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { saleStatus } from "@/lib/sales/money";
import { loadSales } from "@/lib/sales/read";
import { manilaToday, daysBetween } from "@/lib/dates";
import { formatPeso } from "@/lib/rules/money";
import { DealsBoard, type BoardDeal } from "./deals-board";

export default function DealsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="Every sale and its payments, as the Sales Passbook sheet has them. Check here what is still to be collected."
      />
      <Suspense fallback={<PageSkeleton />}><Content /></Suspense>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="rounded-xl p-3 ring-1 ring-foreground/10 sm:p-4">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase sm:text-xs">{label}</p>
      <p className={`text-xl sm:text-2xl font-semibold tracking-tight tabular-nums ${tone ?? ""}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

async function Content() {
  await requireModule("deals");
  const today = manilaToday();
  const sales = await loadSales((await getSettings()).reminders.balanceDays);
  const rows: (BoardDeal & { loan: number })[] = sales.map((d) => ({
    id: d.id, href: `/documents/${d.plate}?tab=sale`, dealNo: d.arNos.length ? `AR ${d.arNos.join(", ")}` : "No AR yet", unitName: d.carName, plates: d.plate, buyerName: d.buyer || "No buyer", createdByName: d.sales,
    saleType: d.financed ? "financing" : "cash", institution: d.lender, price: d.price, received: d.received, balance: d.balance, dueDate: d.dueDate, dueText: null,
    status: saleStatus(d, today), receiptCount: d.paymentCount, loan: d.loan,
    searchText: `${d.carName} ${d.plate} ${d.buyer} ${d.sales} ${d.lender ?? ""} ${d.arNos.join(" ")}`.toLowerCase(),
  }));
  const owe = rows.filter((r) => r.status !== "cancelled" && r.balance > 0);
  const overdue = rows.filter((r) => r.status === "overdue");
  const waiting = rows.filter((r) => r.status === "lender");
  const late = (lo: number, hi: number) => overdue.filter((r) => { const n = daysBetween(r.dueDate!, today); return n >= lo && n <= hi; }).reduce((s, r) => s + r.balance, 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        <Stat label="Still to collect" value={formatPeso(owe.reduce((n, r) => n + r.balance, 0))} sub={`${owe.length} open ${owe.length === 1 ? "deal" : "deals"}`} />
        <Stat label="Overdue" value={formatPeso(overdue.reduce((n, r) => n + r.balance, 0))} tone="text-destructive" sub={`${overdue.length} ${overdue.length === 1 ? "deal" : "deals"} · 1–30 days ${formatPeso(late(1, 30))} · 31–60 ${formatPeso(late(31, 60))} · 60+ ${formatPeso(late(61, 99999))}`} />
        <Stat label="Waiting for the lender" value={String(waiting.length)} tone="text-teal-700" sub={`${formatPeso(waiting.reduce((n, r) => n + r.loan, 0))} in loans not released`} />
      </div>
      <DealsBoard deals={rows} today={today} />
    </>
  );
}
