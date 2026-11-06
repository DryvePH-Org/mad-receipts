import { Suspense, type ComponentProps } from "react";
import { PageSkeleton } from "@/components/pcf/shared/page-skeleton";
import Link from "next/link";
import { FileScan, ReceiptText, Search } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { CsvExportButton } from "@/components/pcf/shared/csv-export-button";
import { EmptyState } from "@/components/pcf/shared/empty-state";
import { MoneyText } from "@/components/pcf/shared/money-text";
import {
  ResponsiveList,
  type ResponsiveListColumn,
} from "@/components/pcf/shared/responsive-list";
import { StatusBadge } from "@/components/pcf/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/pcf/auth";
import { formatDate } from "@/lib/pcf/dates";
import { canPerform } from "@/lib/pcf/permissions";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  VOUCHER_STATUSES,
  VOUCHER_STATUS_LABELS,
  isVoucherStatus,
  type VoucherStatus,
} from "@/lib/pcf/voucher-status";
import type { VoucherListRow } from "@/components/pcf/vouchers/types";

const PAGE_SIZE = 20;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

type SearchParams = {
  status?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: string;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function VouchersPageContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("/pcf/vouchers");
  const params: SearchParams = await searchParams;

  const statusParam = first(params.status);
  const status = isVoucherStatus(statusParam) ? statusParam : undefined;
  const q = (first(params.q) ?? "").trim().slice(0, 100);
  const fromRaw = first(params.from) ?? "";
  const toRaw = first(params.to) ?? "";
  const from = datePattern.test(fromRaw) ? fromRaw : "";
  const to = datePattern.test(toRaw) ? toRaw : "";
  const requestedPage = Number.parseInt(first(params.page) ?? "1", 10);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let query = supabase
    .from("vouchers")
    .select(
      "id, pcv_number, voucher_date, payee, particulars, amount, status, category_id, fund_id",
      { count: "exact" },
    );

  if (status) query = query.eq("status", status);
  if (q) {
    const safe = q.replace(/[,%()"\\]/g, " ").trim();
    if (safe) {
      query = query.or(
        `pcv_number.ilike.%${safe}%,payee.ilike.%${safe}%`,
      );
    }
  }
  if (from) query = query.gte("voucher_date", from);
  if (to) query = query.lte("voucher_date", to);

  const { data, error, count } = await query
    .order("voucher_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) throw new Error(error.message);

  let csvQuery = supabase
    .from("vouchers")
    .select(
      "pcv_number, voucher_date, payee, particulars, amount, status, category_id, fund_id",
    );
  if (status) csvQuery = csvQuery.eq("status", status);
  if (q) {
    const safe = q.replace(/[,%()"\\]/g, " ").trim();
    if (safe) {
      csvQuery = csvQuery.or(`pcv_number.ilike.%${safe}%,payee.ilike.%${safe}%`);
    }
  }
  if (from) csvQuery = csvQuery.gte("voucher_date", from);
  if (to) csvQuery = csvQuery.lte("voucher_date", to);
  const { data: csvData, error: csvError } = await csvQuery
    .order("voucher_date", { ascending: false })
    .limit(5000);
  if (csvError) throw new Error(csvError.message);

  const [categoriesResult, fundsResult] = await Promise.all([
    supabase.from("categories").select("id, name"),
    supabase.from("funds").select("id, name"),
  ]);
  if (categoriesResult.error) throw new Error(categoriesResult.error.message);
  if (fundsResult.error) throw new Error(fundsResult.error.message);

  const categoryNames = new Map(
    categoriesResult.data.map((category) => [category.id, category.name]),
  );
  const fundNames = new Map(
    fundsResult.data.map((fund) => [fund.id, fund.name]),
  );

  const csvRows = csvData.map((voucher) => [
    voucher.pcv_number,
    voucher.voucher_date,
    voucher.payee,
    voucher.particulars,
    categoryNames.get(voucher.category_id) ?? "—",
    fundNames.get(voucher.fund_id) ?? "—",
    voucher.amount,
    isVoucherStatus(voucher.status)
      ? VOUCHER_STATUS_LABELS[voucher.status]
      : voucher.status,
  ]);

  const rows: VoucherListRow[] = data.map((voucher) => ({
    id: voucher.id,
    pcv_number: voucher.pcv_number,
    voucher_date: voucher.voucher_date,
    payee: voucher.payee,
    particulars: voucher.particulars,
    amount: String(voucher.amount),
    status: isVoucherStatus(voucher.status) ? voucher.status : "draft",
    category_name: categoryNames.get(voucher.category_id) ?? "—",
    fund_name: fundNames.get(voucher.fund_id) ?? "—",
  }));

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(status || q || from || to);

  function hrefWith(overrides: Record<string, string | undefined>) {
    const next = new URLSearchParams();
    const merged = {
      status,
      q: q || undefined,
      from: from || undefined,
      to: to || undefined,
      page: page > 1 ? String(page) : undefined,
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const queryString = next.toString();
    return queryString ? `/pcf/vouchers?${queryString}` : "/pcf/vouchers";
  }

  const columns: ResponsiveListColumn<VoucherListRow>[] = [
    {
      key: "pcv",
      header: "PCV number",
      cell: (voucher) => (
        <Link
          href={`/pcf/vouchers/${voucher.id}`}
          className="font-medium hover:underline"
        >
          {voucher.pcv_number}
        </Link>
      ),
    },
    {
      key: "date",
      header: "Date",
      cell: (voucher) => formatDate(voucher.voucher_date),
    },
    { key: "payee", header: "Payee", cell: (voucher) => voucher.payee },
    {
      key: "category",
      header: "Category",
      cell: (voucher) => voucher.category_name,
    },
    {
      key: "amount",
      header: "Amount",
      headerClassName: "text-right",
      className: "text-right",
      cell: (voucher) => <MoneyText value={voucher.amount} />,
    },
    {
      key: "status",
      header: "Status",
      cell: (voucher) => <StatusBadge status={voucher.status} />,
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-0",
      className: "text-right",
      cell: (voucher) => (
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={`/pcf/vouchers/${voucher.id}`} />}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vouchers"
        description="Every petty cash voucher, newest first."
        actions={
          <>
            <CsvExportButton
              filename="vouchers.csv"
              header={[
                "PCV Number",
                "Date",
                "Payee",
                "Particulars",
                "Category",
                "Fund",
                "Amount",
                "Status",
              ]}
              rows={csvRows}
              label="Export CSV"
            />
            {canPerform(user.role, "voucher.create") ? (
              <>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/pcf/vouchers/new?scan=1" />}
                >
                  <FileScan />
                  Scan paper voucher
                </Button>
                <Button nativeButton={false} render={<Link href="/pcf/vouchers/new" />}>
                  <ReceiptText />
                  New voucher
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Link
            href={hrefWith({ status: undefined, page: undefined })}
            aria-current={status ? undefined : "page"}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
              status
                ? "border-border text-muted-foreground hover:bg-muted"
                : "border-transparent bg-primary text-primary-foreground",
            )}
          >
            All
          </Link>
          {VOUCHER_STATUSES.map((value: VoucherStatus) => (
            <Link
              key={value}
              href={hrefWith({ status: value, page: undefined })}
              aria-current={status === value ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
                status === value
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {VOUCHER_STATUS_LABELS[value]}
            </Link>
          ))}
        </div>

        <form
          method="get"
          action="/pcf/vouchers"
          className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-end"
        >
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <div className="min-w-0 flex-1 space-y-1">
            <label htmlFor="voucher-search" className="text-xs text-muted-foreground">
              Search
            </label>
            <Input
              id="voucher-search"
 maxLength={100}
              name="q"
              defaultValue={q}
              placeholder="PCV number or payee"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="voucher-from" className="text-xs text-muted-foreground">
              From
            </label>
            <Input id="voucher-from" type="date" name="from" defaultValue={from} />
          </div>
          <div className="space-y-1">
            <label htmlFor="voucher-to" className="text-xs text-muted-foreground">
              To
            </label>
            <Input id="voucher-to" type="date" name="to" defaultValue={to} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="outline">
              <Search />
              Filter
            </Button>
            {hasFilters ? (
              <Button
                variant="ghost"
                nativeButton={false}
                render={<Link href="/pcf/vouchers" />}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </form>
      </div>

      <ResponsiveList
        rows={rows}
        columns={columns}
        getRowKey={(voucher) => voucher.id}
        renderCard={(voucher) => (
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/pcf/vouchers/${voucher.id}`}
                    className="font-medium hover:underline"
                  >
                    {voucher.pcv_number}
                  </Link>
                  <p className="truncate text-sm text-muted-foreground">
                    {voucher.payee}
                  </p>
                </div>
                <StatusBadge status={voucher.status} />
              </div>
              <div className="flex items-end justify-between gap-3 text-sm">
                <div className="text-muted-foreground">
                  <p>{formatDate(voucher.voucher_date)}</p>
                  <p>{voucher.category_name}</p>
                </div>
                <MoneyText value={voucher.amount} className="text-base font-medium" />
              </div>
            </CardContent>
          </Card>
        )}
        empty={
          <EmptyState
            icon={ReceiptText}
            title={hasFilters ? "No vouchers match" : "No vouchers yet"}
            description={
              hasFilters
                ? "Try a different status, search term, or date range."
                : "Record the first petty cash expense to see it here."
            }
          />
        }
      />

      {total > 0 ? (
        <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              nativeButton={page <= 1}
              render={
                page <= 1 ? undefined : (
                  <Link href={hrefWith({ page: page - 1 > 1 ? String(page - 1) : undefined })} />
                )
              }
            >
              Previous
            </Button>
            <span className="tabular-nums">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              nativeButton={page >= totalPages}
              render={
                page >= totalPages ? undefined : (
                  <Link href={hrefWith({ page: String(page + 1) })} />
                )
              }
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// The page streams in behind a skeleton, like every MAD page (data is read per request).
export default function VouchersPage(props: ComponentProps<typeof VouchersPageContent>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <VouchersPageContent {...props} />
    </Suspense>
  );
}
