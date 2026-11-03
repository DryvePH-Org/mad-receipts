import { Suspense } from "react";
import Link from "next/link";
import { Camera, Receipt, Search, SearchX } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { ResponsiveList } from "@/components/shared/responsive-list";
import { Pill, ReceiptStatusBadge } from "@/components/shared/status-badge";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { paymentTypeLabel } from "@/lib/deals";
import { normalizePlate } from "@/lib/rules/validate";
import { pageNumber, pageRange, param, searchTerm } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

const TYPES = ["earnest", "partial", "full"] as const;
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

export default function ReceiptsPage({ searchParams }: PageProps<"/receipts">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageSkeleton />}>
        <ReceiptsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ReceiptsContent({ searchParams }: { searchParams: PageProps<"/receipts">["searchParams"] }) {
  await requireUser();
  const sp = await searchParams;
  const q = searchTerm(param(sp.q));
  const type = TYPES.find((t) => t === param(sp.type)) ?? "";
  const from = isDate(param(sp.from)) ? param(sp.from) : "";
  const to = isDate(param(sp.to)) ? param(sp.to) : "";
  const page = pageNumber(sp.page);

  const supabase = await createClient();
  let query = supabase
    .from("receipt_list")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(...pageRange(page));
  if (type) query = query.eq("payment_type", type);
  if (from) query = query.gte("receipt_date", from);
  if (to) query = query.lte("receipt_date", to);
  if (q) {
    const plate = normalizePlate(q);
    query = query.or(
      [`receipt_no.ilike.*${q}*`, `buyer_name.ilike.*${q}*`, plate && `plate_no.ilike.*${plate}*`].filter(Boolean).join(","),
    );
  }
  const { data: receipts, count, error } = await query;
  if (error) return <p className="text-destructive">Could not load the receipts. Please try again.</p>;

  const filtered = Boolean(q || type || from || to);
  const typeBadge = (r: (typeof receipts)[number]) =>
    r.status === "voided" ? <ReceiptStatusBadge status={r.status} /> : <Pill tone="grey">{paymentTypeLabel(r.payment_type)}</Pill>;

  return (
    <>
      <PageHeader
        title="Receipts"
        description="Every payment received, newest first."
        actions={
          <Button nativeButton={false} render={<Link href="/upload" />}>
            <Camera /> Upload receipt
          </Button>
        }
      />

      <Card>
        <CardContent>
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_11rem_9.5rem_9.5rem_auto]">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input name="q" defaultValue={q} placeholder="Receipt no., buyer or plate" aria-label="Search receipt number, buyer or plate" className="pl-8" />
            </div>
            <NativeSelect name="type" defaultValue={type} aria-label="Filter by payment type" className="sm:col-span-2 lg:col-span-1">
              <option value="">All payment types</option>
              <option value="earnest">Earnest money</option>
              <option value="partial">Partial payment</option>
              <option value="full">Full payment</option>
            </NativeSelect>
            <label className="space-y-1 text-xs text-muted-foreground lg:space-y-0">
              <span className="lg:sr-only">From</span>
              <Input type="date" name="from" defaultValue={from} aria-label="From date" />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground lg:space-y-0">
              <span className="lg:sr-only">To</span>
              <Input type="date" name="to" defaultValue={to} aria-label="To date" />
            </label>
            <Button type="submit" className="sm:col-span-2 lg:col-span-1">
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        {count ?? 0} {count === 1 ? "receipt" : "receipts"}
        {filtered && (
          <>
            {" · "}
            <Link href="/receipts" className="font-medium text-foreground underline">
              Clear filters
            </Link>
          </>
        )}
      </p>

      <ResponsiveList
        rows={receipts}
        getRowKey={(r) => r.id ?? ""}
        getRowHref={(r) => `/deals/${r.deal_id}`}
        empty={
          <EmptyState
            icon={filtered ? SearchX : Receipt}
            title={filtered ? "No receipts match" : "No receipts yet"}
            description={filtered ? "Try a different search or widen the dates." : "Confirmed receipts appear here."}
          />
        }
        columns={[
          { key: "no", header: "Receipt", cell: (r) => <span className={r.status === "voided" ? "line-through" : ""}>No. {r.receipt_no}</span> },
          { key: "plate", header: "Plate", cell: (r) => r.plate_no },
          { key: "buyer", header: "Buyer", cell: (r) => <span className="block max-w-56 truncate">{r.buyer_name}</span> },
          { key: "date", header: "Date", cell: (r) => (r.receipt_date ? formatDate(r.receipt_date) : "—") },
          { key: "type", header: "Type", cell: typeBadge },
          { key: "amount", header: "Amount", headerClassName: "text-right", className: "text-right font-medium", cell: (r) => <MoneyText value={r.amount} /> },
        ]}
        renderCard={(r) => (
          <Link href={`/deals/${r.deal_id}`} className="block space-y-1.5 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors active:bg-muted">
            <div className="flex items-start justify-between gap-3">
              <p className={r.status === "voided" ? "text-lg font-semibold line-through" : "text-lg font-semibold"}>No. {r.receipt_no}</p>
              {typeBadge(r)}
            </div>
            <p className="text-sm text-muted-foreground">
              {r.plate_no} · {r.buyer_name}
            </p>
            <p className="flex flex-wrap gap-x-3 text-sm">
              <span className="font-medium"><MoneyText value={r.amount} /></span>
              {r.receipt_date && <span className="text-muted-foreground">{formatDate(r.receipt_date)}</span>}
            </p>
          </Link>
        )}
      />

      <Pagination page={page} total={count ?? 0} path="/receipts" params={{ q, type, from, to }} />
    </>
  );
}
