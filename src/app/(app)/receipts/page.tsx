import { Suspense } from "react";
import Link from "next/link";
import { Pagination } from "@/components/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { paymentTypeLabel, pesos } from "@/lib/deals";
import { normalizePlate } from "@/lib/rules/validate";
import { pageNumber, pageRange, param, searchTerm } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

const TYPES = ["earnest", "partial", "full"] as const;
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

export default function ReceiptsPage({ searchParams }: PageProps<"/receipts">) {
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">Receipts</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
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

  const filtered = q || type || from || to;

  return (
    <>
      <form method="get" className="space-y-3">
        <Input name="q" defaultValue={q} placeholder="Search receipt no., buyer or plate" className="h-12 text-base" aria-label="Search receipt number, buyer or plate" />
        <select
          name="type"
          defaultValue={type}
          aria-label="Filter by payment type"
          className="h-12 w-full rounded-lg border border-input bg-transparent px-3 text-base"
        >
          <option value="">All payment types</option>
          <option value="earnest">Earnest money</option>
          <option value="partial">Partial payment</option>
          <option value="full">Full payment</option>
        </select>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm text-muted-foreground">
            From
            <Input type="date" name="from" defaultValue={from} className="h-12 text-base" />
          </label>
          <label className="space-y-1 text-sm text-muted-foreground">
            To
            <Input type="date" name="to" defaultValue={to} className="h-12 text-base" />
          </label>
        </div>
        <Button type="submit" className="h-12 w-full text-base">
          Search
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        {count ?? 0} {count === 1 ? "receipt" : "receipts"}
        {filtered && (
          <>
            {" · "}
            <Link href="/receipts" className="font-medium underline">
              Clear
            </Link>
          </>
        )}
      </p>

      {receipts.length === 0 ? (
        <p className="rounded-lg border p-6 text-center text-muted-foreground">No receipts found.</p>
      ) : (
        <ul className="space-y-3">
          {receipts.map((r) => (
            <li key={r.id}>
              <Link href={`/deals/${r.deal_id}`} className="block space-y-1.5 rounded-lg border p-4 active:bg-muted">
                <div className="flex items-start justify-between gap-3">
                  <p className={r.status === "voided" ? "text-lg font-semibold line-through" : "text-lg font-semibold"}>
                    No. {r.receipt_no}
                  </p>
                  {r.status === "voided" ? <Badge variant="destructive">Voided</Badge> : <Badge variant="secondary">{paymentTypeLabel(r.payment_type)}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">
                  {r.plate_no} · {r.buyer_name}
                </p>
                <p className="flex flex-wrap gap-x-3 text-sm">
                  <span className="font-medium">{pesos(r.amount)}</span>
                  {r.receipt_date && <span className="text-muted-foreground">{formatDate(r.receipt_date)}</span>}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Pagination page={page} total={count ?? 0} path="/receipts" params={{ q, type, from, to }} />
    </>
  );
}
