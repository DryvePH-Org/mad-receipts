import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/lib/auth";
import { listDeals } from "@/lib/data";
import { manilaToday, daysBetween } from "@/lib/dates";
import { dealStatusKey } from "@/lib/deal/status";
import { formatPeso } from "@/lib/rules/money";
import { DealsBoard, type BoardDeal } from "./deals-board";

export default function DealsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="Every deal and its receipts. A financed car takes more than one receipt, so check here what is still unpaid."
        actions={<Button nativeButton={false} render={<Link href="/new" />}><Plus /> New receipt</Button>}
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
  const deals = await listDeals();
  const rows: (BoardDeal & { loan: number })[] = deals.map((d) => ({
    id: d.id, dealNo: d.dealNo, unitName: d.unitName, plates: d.plates, buyerName: d.buyerName, createdByName: d.createdByName, saleType: d.saleType,
    institution: d.institution, price: d.price, received: d.approvedPaid, balance: d.balance, dueDate: d.dueDate, dueText: d.dueText,
    status: dealStatusKey({ status: d.status, balance: d.balance, due_date: d.dueDate, sale_type: d.saleType, loan_status: d.loanStatus }, today),
    receiptCount: d.approvedCount + d.pendingCount, pendingCount: d.pendingCount, loan: d.loan,
    searchText: `${d.unitName} ${d.plates} ${d.buyerName} ${d.createdByName} ${d.institution ?? ""} ${d.receiptNos} ${d.dealNo}`.toLowerCase(),
  }));
  const owe = rows.filter((r) => r.status !== "cancelled" && r.balance > 0);
  const overdue = rows.filter((r) => r.status === "overdue");
  const waiting = rows.filter((r) => r.status === "lender");
  const pending = deals.reduce((n, d) => n + d.pendingCount, 0), pendingAmount = deals.reduce((n, d) => n + d.pendingPaid, 0);
  const late = (lo: number, hi: number) => overdue.filter((r) => { const n = daysBetween(r.dueDate!, today); return n >= lo && n <= hi; }).reduce((s, r) => s + r.balance, 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Still to collect" value={formatPeso(owe.reduce((n, r) => n + r.balance, 0))} sub={`${owe.length} open ${owe.length === 1 ? "deal" : "deals"}`} />
        <Stat label="Overdue" value={formatPeso(overdue.reduce((n, r) => n + r.balance, 0))} tone="text-destructive" sub={`${overdue.length} ${overdue.length === 1 ? "deal" : "deals"} · 1–30 days ${formatPeso(late(1, 30))} · 31–60 ${formatPeso(late(31, 60))} · 60+ ${formatPeso(late(61, 99999))}`} />
        <Stat label="Waiting for the lender" value={String(waiting.length)} tone="text-teal-700" sub={`${formatPeso(waiting.reduce((n, r) => n + r.loan, 0))} in loans not released`} />
        <Stat label="Waiting for approval" value={String(pending)} tone="text-violet-700" sub={`${formatPeso(pendingAmount)} in receipts`} />
      </div>
      <DealsBoard deals={rows} today={today} />
    </>
  );
}
