import { Suspense, type ComponentProps } from "react";
import { PageSkeleton } from "@/components/pcf/shared/page-skeleton";
import Link from "next/link";
import { BarChart3, History } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { CategorySpendChart } from "@/components/pcf/reports/category-spend-chart";
import { MonthSpendChart } from "@/components/pcf/reports/month-spend-chart";
import { CsvExportButton } from "@/components/pcf/shared/csv-export-button";
import { EmptyState } from "@/components/pcf/shared/empty-state";
import { MoneyText } from "@/components/pcf/shared/money-text";
import {
  ResponsiveList,
  type ResponsiveListColumn,
} from "@/components/pcf/shared/responsive-list";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/pcf/auth";
import { formatDateTime, formatMonth } from "@/lib/pcf/dates";
import { formatPHP } from "@/lib/pcf/money";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const CASH_COUNT_LIMIT = 100;

type SearchParams = { from?: string; to?: string };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function varianceClass(value: number) {
  return value === 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-destructive";
}

async function ReportsPageContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser("/pcf/reports");
  const params: SearchParams = await searchParams;

  const fromRaw = first(params.from) ?? "";
  const toRaw = first(params.to) ?? "";
  const from = datePattern.test(fromRaw) ? fromRaw : "";
  const to = datePattern.test(toRaw) ? toRaw : "";
  const hasFilters = Boolean(from || to);

  const supabase = await createClient();

  let voucherQuery = supabase
    .from("vouchers")
    .select("pcv_number, voucher_date, payee, amount, category_id, voucher_items(amount, category_id)")
    .neq("status", "void")
    .not("released_at", "is", null);
  if (from) voucherQuery = voucherQuery.gte("voucher_date", from);
  if (to) voucherQuery = voucherQuery.lte("voucher_date", to);

  let cashCountQuery = supabase
    .from("cash_counts")
    .select(
      "id, fund_id, counted_cash, expected_cash, variance, note, counted_by, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(CASH_COUNT_LIMIT);
  if (from) cashCountQuery = cashCountQuery.gte("created_at", `${from}T00:00:00`);
  if (to) cashCountQuery = cashCountQuery.lte("created_at", `${to}T23:59:59`);

  const [vouchersResult, categoriesResult, cashCountsResult, profilesResult, fundsResult] =
    await Promise.all([
      voucherQuery,
      supabase.from("categories").select("id, name"),
      cashCountQuery,
      supabase.from("profiles").select("id, full_name"),
      supabase.from("funds").select("id, name"),
    ]);

  if (vouchersResult.error) throw new Error(vouchersResult.error.message);
  if (categoriesResult.error) throw new Error(categoriesResult.error.message);
  if (cashCountsResult.error) throw new Error(cashCountsResult.error.message);
  if (profilesResult.error) throw new Error(profilesResult.error.message);
  if (fundsResult.error) throw new Error(fundsResult.error.message);

  const vouchers = vouchersResult.data;
  const categoryNames = new Map(
    categoriesResult.data.map((category) => [category.id, category.name]),
  );
  const profileNames = new Map(
    profilesResult.data.map((profile) => [profile.id, profile.full_name]),
  );
  const fundNames = new Map(
    fundsResult.data.map((fund) => [fund.id, fund.name]),
  );

  const categoryTotals = new Map<string, number>();
  const monthTotals = new Map<string, number>();
  const payeeTotals = new Map<string, number>();

  for (const voucher of vouchers) {
    // Each line counts toward its own category.
    const spread = voucher.voucher_items.length
      ? voucher.voucher_items
      : [{ amount: voucher.amount, category_id: voucher.category_id }];
    for (const line of spread) {
      const categoryName = categoryNames.get(line.category_id) ?? "—";
      categoryTotals.set(
        categoryName,
        (categoryTotals.get(categoryName) ?? 0) + Number(line.amount),
      );
    }

    const monthKey = voucher.voucher_date.slice(0, 7);
    monthTotals.set(
      monthKey,
      (monthTotals.get(monthKey) ?? 0) + Number(voucher.amount),
    );

    payeeTotals.set(
      voucher.payee,
      (payeeTotals.get(voucher.payee) ?? 0) + Number(voucher.amount),
    );
  }

  const categoryRows = [...categoryTotals.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const monthRows = [...monthTotals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({ month, label: formatMonth(month), total }));

  const payeeRows = [...payeeTotals.entries()]
    .map(([payee, total]) => ({ payee, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const cashCountRows = cashCountsResult.data.map((row) => ({
    id: row.id,
    fund_name: fundNames.get(row.fund_id) ?? "—",
    counted_cash: Number(row.counted_cash),
    expected_cash: Number(row.expected_cash),
    variance: Number(row.variance ?? 0),
    note: row.note,
    counted_by_name: row.counted_by
      ? (profileNames.get(row.counted_by) ?? "—")
      : "—",
    created_at: row.created_at,
  }));

  const payeeColumns: ResponsiveListColumn<(typeof payeeRows)[number]>[] = [
    { key: "payee", header: "Payee", cell: (row) => row.payee },
    {
      key: "total",
      header: "Total spend",
      headerClassName: "text-right",
      className: "text-right",
      cell: (row) => <MoneyText value={String(row.total)} />,
    },
  ];

  const cashCountColumns: ResponsiveListColumn<(typeof cashCountRows)[number]>[] = [
    {
      key: "date",
      header: "Date",
      className: "whitespace-nowrap",
      cell: (row) => formatDateTime(row.created_at),
    },
    { key: "fund", header: "Fund", cell: (row) => row.fund_name },
    {
      key: "counted",
      header: "Counted",
      headerClassName: "text-right",
      className: "text-right",
      cell: (row) => <MoneyText value={String(row.counted_cash)} />,
    },
    {
      key: "expected",
      header: "Expected",
      headerClassName: "text-right",
      className: "text-right",
      cell: (row) => <MoneyText value={String(row.expected_cash)} />,
    },
    {
      key: "variance",
      header: "Variance",
      headerClassName: "text-right",
      className: "text-right",
      cell: (row) => (
        <MoneyText
          value={String(row.variance)}
          className={cn("font-medium", varianceClass(row.variance))}
        />
      ),
    },
    { key: "counted_by", header: "Counted by", cell: (row) => row.counted_by_name },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Spending by category and period, plus fund activity summaries."
      />

      <form
        method="get"
        action="/pcf/reports"
        className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="space-y-1">
          <label htmlFor="reports-from" className="text-xs text-muted-foreground">
            From
          </label>
          <Input id="reports-from" type="date" name="from" defaultValue={from} />
        </div>
        <div className="space-y-1">
          <label htmlFor="reports-to" className="text-xs text-muted-foreground">
            To
          </label>
          <Input id="reports-to" type="date" name="to" defaultValue={to} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="outline">
            Filter
          </Button>
          {hasFilters ? (
            <Button variant="ghost" nativeButton={false} render={<Link href="/pcf/reports" />}>
              Clear
            </Button>
          ) : null}
        </div>
      </form>

      {vouchers.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No data to report"
          description="Charts and summaries will populate once vouchers are recorded."
        />
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Spend by category</CardTitle>
                <CardDescription>
                  Every non-void voucher in the selected range.
                </CardDescription>
              </div>
              <CsvExportButton
                filename="spend-by-category.csv"
                header={["Category", "Total"]}
                rows={categoryRows.map((row) => [row.name, row.total])}
              />
            </CardHeader>
            <CardContent>
              <CategorySpendChart data={categoryRows} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Spend by month</CardTitle>
                <CardDescription>Voucher amount by voucher date.</CardDescription>
              </div>
              <CsvExportButton
                filename="spend-by-month.csv"
                header={["Month", "Total"]}
                rows={monthRows.map((row) => [row.label, row.total])}
              />
            </CardHeader>
            <CardContent>
              <MonthSpendChart data={monthRows} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>Spend by payee</CardTitle>
                <CardDescription>Top 10 payees in the selected range.</CardDescription>
              </div>
              <CsvExportButton
                filename="spend-by-payee.csv"
                header={["Payee", "Total"]}
                rows={payeeRows.map((row) => [row.payee, row.total])}
              />
            </CardHeader>
            <CardContent>
              <ResponsiveList
                rows={payeeRows}
                columns={payeeColumns}
                getRowKey={(row) => row.payee}
                renderCard={(row) => (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                    <p className="truncate font-medium">{row.payee}</p>
                    <MoneyText value={String(row.total)} />
                  </div>
                )}
              />
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Cash count variance history</CardTitle>
            <CardDescription>
              The latest {CASH_COUNT_LIMIT} counts in the selected range.
            </CardDescription>
          </div>
          <CsvExportButton
            filename="cash-count-history.csv"
            header={[
              "Date",
              "Fund",
              "Counted",
              "Expected",
              "Variance",
              "Note",
              "Counted by",
            ]}
            rows={cashCountRows.map((row) => [
              row.created_at,
              row.fund_name,
              row.counted_cash,
              row.expected_cash,
              row.variance,
              row.note ?? "",
              row.counted_by_name,
            ])}
          />
        </CardHeader>
        <CardContent>
          <ResponsiveList
            rows={cashCountRows}
            columns={cashCountColumns}
            getRowKey={(row) => row.id}
            renderCard={(row) => (
              <div className="rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.fund_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateTime(row.created_at)}
                    </p>
                  </div>
                  <MoneyText
                    value={String(row.variance)}
                    className={cn(
                      "shrink-0 text-sm font-medium",
                      varianceClass(row.variance),
                    )}
                  />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Counted</dt>
                    <dd>{formatPHP(row.counted_cash)}</dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-muted-foreground">Expected</dt>
                    <dd>{formatPHP(row.expected_cash)}</dd>
                  </div>
                </dl>
                {row.note ? (
                  <p className="mt-3 text-sm text-pretty">{row.note}</p>
                ) : null}
                <p className="mt-2 text-xs text-muted-foreground">
                  Counted by {row.counted_by_name}
                </p>
              </div>
            )}
            empty={
              <EmptyState
                icon={History}
                title="No counts recorded"
                description="Cash count history will appear here once recorded."
              />
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

// The page streams in behind a skeleton, like every MAD page (data is read per request).
export default function ReportsPage(props: ComponentProps<typeof ReportsPageContent>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReportsPageContent {...props} />
    </Suspense>
  );
}
