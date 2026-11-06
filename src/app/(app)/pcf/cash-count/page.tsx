import { Suspense } from "react";
import { PageSkeleton } from "@/components/pcf/shared/page-skeleton";
import { History, Wallet } from "lucide-react";

import {
  CashCountForm,
  type CashCountFund,
} from "@/components/pcf/cash-count/cash-count-form";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/pcf/shared/empty-state";
import { MoneyText } from "@/components/pcf/shared/money-text";
import {
  ResponsiveList,
  type ResponsiveListColumn,
} from "@/components/pcf/shared/responsive-list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/pcf/auth";
import { formatDateTime } from "@/lib/pcf/dates";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const HISTORY_LIMIT = 20;

type CashCountRow = {
  id: string;
  fund_name: string;
  counted_cash: string;
  expected_cash: string;
  variance: string;
  note: string | null;
  counted_by_name: string;
  created_at: string;
};

function varianceClass(value: string) {
  return Number(value) === 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-destructive";
}

async function CashCountPageContent() {
  await requireUser("/pcf/cash-count");

  const supabase = await createClient();
  const [fundsResult, balancesResult, countsResult, profilesResult] =
    await Promise.all([
      supabase.from("funds").select("id, name, is_active").order("name"),
      supabase
        .from("fund_balance_v")
        .select("fund_id, name, expected_cash, is_low"),
      supabase
        .from("cash_counts")
        .select(
          "id, fund_id, counted_cash, expected_cash, variance, note, counted_by, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT),
      supabase.from("profiles").select("id, full_name"),
    ]);

  const error =
    fundsResult.error ??
    balancesResult.error ??
    countsResult.error ??
    profilesResult.error;
  if (error) throw new Error(error.message);

  const funds = fundsResult.data ?? [];
  const balanceMap = new Map(
    (balancesResult.data ?? []).map((balance) => [balance.fund_id, balance]),
  );
  const fundNames = new Map(funds.map((fund) => [fund.id, fund.name]));
  const profileNames = new Map(
    (profilesResult.data ?? []).map((profile) => [
      profile.id,
      profile.full_name,
    ]),
  );

  const countFunds: CashCountFund[] = funds
    .filter((fund) => fund.is_active && balanceMap.has(fund.id))
    .map((fund) => ({
      id: fund.id,
      name: fund.name,
      expected_cash: Number(balanceMap.get(fund.id)?.expected_cash ?? 0),
    }));

  const rows: CashCountRow[] = (countsResult.data ?? []).map((count) => ({
    id: count.id,
    fund_name: fundNames.get(count.fund_id) ?? "—",
    counted_cash: String(count.counted_cash),
    expected_cash: String(count.expected_cash),
    variance: String(count.variance ?? 0),
    note: count.note,
    counted_by_name: profileNames.get(count.counted_by) ?? "—",
    created_at: count.created_at,
  }));

  const columns: ResponsiveListColumn<CashCountRow>[] = [
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
      cell: (row) => <MoneyText value={row.counted_cash} />,
    },
    {
      key: "expected",
      header: "Expected",
      headerClassName: "text-right",
      className: "text-right",
      cell: (row) => <MoneyText value={row.expected_cash} />,
    },
    {
      key: "variance",
      header: "Variance",
      headerClassName: "text-right",
      className: "text-right",
      cell: (row) => (
        <MoneyText
          value={row.variance}
          className={cn("font-medium", varianceClass(row.variance))}
        />
      ),
    },
    {
      key: "note",
      header: "Note",
      cell: (row) =>
        row.note ? (
          <span className="block max-w-64 truncate" title={row.note}>
            {row.note}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "counted_by",
      header: "Counted by",
      cell: (row) => row.counted_by_name,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash Count"
        description="Record counted cash and compare it against the expected fund balance."
      />

      {countFunds.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No active fund"
          description="Ask an administrator to assign you an active fund before recording counts."
        />
      ) : (
        <CashCountForm funds={countFunds} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Count history</CardTitle>
          <CardDescription>
            The latest {HISTORY_LIMIT} counts across all funds.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveList
            rows={rows}
            columns={columns}
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
                    value={row.variance}
                    className={cn(
                      "shrink-0 text-sm font-medium",
                      varianceClass(row.variance),
                    )}
                  />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Counted</dt>
                    <dd>
                      <MoneyText value={row.counted_cash} />
                    </dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-muted-foreground">Expected</dt>
                    <dd>
                      <MoneyText value={row.expected_cash} />
                    </dd>
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
                description="The first saved count will appear here."
              />
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

// The page streams in behind a skeleton, like every MAD page (data is read per request).
export default function CashCountPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CashCountPageContent />
    </Suspense>
  );
}
