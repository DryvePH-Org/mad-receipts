import { Suspense } from "react";
import Link from "next/link";
import { DealStatusBadge } from "@/components/deal-status-badge";
import { DueBadge } from "@/components/due-badge";
import { Pagination } from "@/components/pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth";
import { formatDate, manilaToday } from "@/lib/dates";
import { pesos } from "@/lib/deals";
import { normalizePlate } from "@/lib/rules/validate";
import { pageNumber, pageRange, param, searchTerm } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

const STATUSES = ["open", "completed", "cancelled"] as const;

export default function DealsPage({ searchParams }: PageProps<"/deals">) {
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">Deals</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
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

  return (
    <>
      <form method="get" className="space-y-3">
        <Input name="q" defaultValue={q} placeholder="Search plate or buyer" className="h-12 text-base" aria-label="Search plate or buyer" />
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <select
            name="status"
            defaultValue={status}
            aria-label="Filter by status"
            className="h-12 rounded-lg border border-input bg-transparent px-3 text-base"
          >
            <option value="">All statuses</option>
            <option value="open">Reserved</option>
            <option value="completed">Sold</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <Button type="submit" className="h-12 px-6 text-base">
            Search
          </Button>
        </div>
      </form>

      <p className="text-sm text-muted-foreground">
        {count ?? 0} {count === 1 ? "deal" : "deals"}
        {(q || status) && (
          <>
            {" · "}
            <Link href="/deals" className="font-medium underline">
              Clear
            </Link>
          </>
        )}
      </p>

      {deals.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-muted-foreground">No deals found.</p>
      ) : (
        <ul className="space-y-3">
          {deals.map((deal) => (
            <li key={deal.id}>
              <Link href={`/deals/${deal.id}`} className="block space-y-2 rounded-lg border p-4 active:bg-muted">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold">{deal.plate_no}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {[deal.make_type, deal.buyer_name].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <DealStatusBadge status={deal.status} />
                </div>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Price</dt>
                    <dd className="font-medium">{pesos(deal.agreed_price)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Paid</dt>
                    <dd className="font-medium">{pesos(deal.total_paid)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Balance</dt>
                    <dd className="font-medium">{pesos(deal.balance)}</dd>
                  </div>
                </dl>
                {deal.next_due_date && (
                  <p className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Due {formatDate(deal.next_due_date)}</span>
                    <DueBadge dueDate={deal.next_due_date} today={today} />
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} total={count ?? 0} path="/deals" params={{ q, status }} />
    </>
  );
}
