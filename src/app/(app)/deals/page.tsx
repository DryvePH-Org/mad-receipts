import { Suspense } from "react";
import Link from "next/link";
import { Camera, Car, Search, SearchX } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DueBadge } from "@/components/shared/due-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { ResponsiveList } from "@/components/shared/responsive-list";
import { DealStatusBadge } from "@/components/shared/status-badge";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { requireUser } from "@/lib/auth";
import { formatDate, manilaToday } from "@/lib/dates";
import { normalizePlate } from "@/lib/rules/validate";
import { pageNumber, pageRange, param, searchTerm } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

const STATUSES = ["open", "completed", "cancelled"] as const;

export default function DealsPage({ searchParams }: PageProps<"/deals">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageSkeleton />}>
        <DealsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DealsContent({ searchParams }: { searchParams: PageProps<"/deals">["searchParams"] }) {
  await requireUser();
  const sp = await searchParams;
  const q = searchTerm(param(sp.q));
  const status = STATUSES.find((s) => s === param(sp.status)) ?? "";
  const page = pageNumber(sp.page);

  const supabase = await createClient();
  let query = supabase
    .from("deal_summaries")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(...pageRange(page));
  if (status) query = query.eq("status", status);
  if (q) {
    const plate = normalizePlate(q);
    query = query.or([plate && `plate_no.ilike.*${plate}*`, `buyer_name.ilike.*${q}*`].filter(Boolean).join(","));
  }
  const { data: deals, count, error } = await query;
  if (error) return <p className="text-destructive">Could not load the deals. Please try again.</p>;

  const today = manilaToday();
  const filtered = Boolean(q || status);

  return (
    <>
      <PageHeader
        title="Deals"
        description="Every car that is reserved, sold or cancelled, with what has been paid."
        actions={
          <Button nativeButton={false} render={<Link href="/upload" />}>
            <Camera /> Upload receipt
          </Button>
        }
      />

      <Card>
        <CardContent>
          <form method="get" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input name="q" defaultValue={q} placeholder="Search plate or buyer" aria-label="Search plate or buyer" className="pl-8" />
            </div>
            <NativeSelect name="status" defaultValue={status} aria-label="Filter by status">
              <option value="">All statuses</option>
              <option value="open">Reserved</option>
              <option value="completed">Sold</option>
              <option value="cancelled">Cancelled</option>
            </NativeSelect>
            <Button type="submit">Search</Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        {count ?? 0} {count === 1 ? "deal" : "deals"}
        {filtered && (
          <>
            {" · "}
            <Link href="/deals" className="font-medium text-foreground underline">
              Clear filters
            </Link>
          </>
        )}
      </p>

      <ResponsiveList
        rows={deals}
        getRowKey={(d) => d.id ?? ""}
        getRowHref={(d) => `/deals/${d.id}`}
        empty={
          <EmptyState
            icon={filtered ? SearchX : Car}
            title={filtered ? "No deals match" : "No deals yet"}
            description={filtered ? "Try a different plate, name or status." : "A deal appears here when its first receipt is confirmed."}
          />
        }
        columns={[
          { key: "plate", header: "Plate", cell: (d) => d.plate_no },
          {
            key: "buyer",
            header: "Buyer",
            cell: (d) => (
              <span className="block min-w-0">
                <span className="block truncate">{d.buyer_name}</span>
                {d.make_type && <span className="block truncate text-xs text-muted-foreground">{d.make_type}</span>}
              </span>
            ),
          },
          { key: "price", header: "Price", headerClassName: "text-right", className: "text-right", cell: (d) => <MoneyText value={d.agreed_price} /> },
          { key: "paid", header: "Paid", headerClassName: "text-right", className: "text-right", cell: (d) => <MoneyText value={d.total_paid} /> },
          { key: "balance", header: "Balance", headerClassName: "text-right", className: "text-right font-medium", cell: (d) => <MoneyText value={d.balance} /> },
          { key: "status", header: "Status", cell: (d) => <DealStatusBadge status={d.status} /> },
          {
            key: "due",
            header: "Next due",
            cell: (d) =>
              d.next_due_date ? (
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground">{formatDate(d.next_due_date)}</span>
                  <DueBadge dueDate={d.next_due_date} today={today} />
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          },
        ]}
        renderCard={(d) => (
          <Link href={`/deals/${d.id}`} className="block rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors active:bg-muted">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-semibold">{d.plate_no}</p>
                <p className="truncate text-sm text-muted-foreground">{[d.make_type, d.buyer_name].filter(Boolean).join(" · ")}</p>
              </div>
              <DealStatusBadge status={d.status} />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Price</dt>
                <dd className="font-medium"><MoneyText value={d.agreed_price} /></dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Paid</dt>
                <dd className="font-medium"><MoneyText value={d.total_paid} /></dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Balance</dt>
                <dd className="font-medium"><MoneyText value={d.balance} /></dd>
              </div>
            </dl>
            {d.next_due_date && (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Due {formatDate(d.next_due_date)}</span>
                <DueBadge dueDate={d.next_due_date} today={today} />
              </p>
            )}
          </Link>
        )}
      />

      <Pagination page={page} total={count ?? 0} path="/deals" params={{ q, status }} />
    </>
  );
}
