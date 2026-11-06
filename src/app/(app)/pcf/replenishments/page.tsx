import { Suspense } from "react";
import { PageSkeleton } from "@/components/pcf/shared/page-skeleton";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

import { NewReplenishmentButton } from "@/components/pcf/replenishments/new-replenishment-button";
import type {
  ReplenishmentFundOption,
  ReplenishmentListRow,
} from "@/components/pcf/replenishments/types";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/pcf/shared/empty-state";
import { MoneyText } from "@/components/pcf/shared/money-text";
import { ReplenishmentStatusBadge } from "@/components/pcf/shared/replenishment-status-badge";
import {
  ResponsiveList,
  type ResponsiveListColumn,
} from "@/components/pcf/shared/responsive-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/pcf/auth";
import { formatDate } from "@/lib/pcf/dates";
import { canPerform } from "@/lib/pcf/permissions";
import { isReplenishmentStatus } from "@/lib/pcf/replenishment-status";
import { createClient } from "@/lib/supabase/server";

const ELIGIBLE_STATUSES = ["released", "approved", "rejected"] as const;

async function ReplenishmentsPageContent() {
  const user = await requireUser("/pcf/replenishments");
  const supabase = await createClient();

  const [replenishmentsResult, fundsResult, eligibleResult, linkedResult] =
    await Promise.all([
      supabase
        .from("replenishments")
        .select(
          "id, request_no, fund_id, status, total, requested_by, created_at",
        )
        .order("created_at", { ascending: false }),
      supabase.from("funds").select("id, name, is_active"),
      supabase
        .from("vouchers")
        .select("fund_id, amount")
        .in("status", ELIGIBLE_STATUSES)
        .not("released_at", "is", null)
        .is("replenishment_id", null),
      supabase
        .from("vouchers")
        .select("replenishment_id")
        .not("replenishment_id", "is", null),
    ]);

  if (replenishmentsResult.error) throw new Error(replenishmentsResult.error.message);
  if (fundsResult.error) throw new Error(fundsResult.error.message);
  if (eligibleResult.error) throw new Error(eligibleResult.error.message);
  if (linkedResult.error) throw new Error(linkedResult.error.message);

  const replenishments = replenishmentsResult.data;
  const funds = fundsResult.data;
  const fundNames = new Map(funds.map((fund) => [fund.id, fund.name]));
  const activeFundIds = new Set(
    funds.filter((fund) => fund.is_active).map((fund) => fund.id),
  );

  const requestedByIds = [
    ...new Set(
      replenishments
        .map((replenishment) => replenishment.requested_by)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const requestedByNames = new Map<string, string>();
  if (requestedByIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", requestedByIds);
    if (profileError) throw new Error(profileError.message);
    for (const profile of profiles) {
      requestedByNames.set(profile.id, profile.full_name ?? "—");
    }
  }

  const voucherCounts = new Map<string, number>();
  for (const voucher of linkedResult.data) {
    if (!voucher.replenishment_id) continue;
    voucherCounts.set(
      voucher.replenishment_id,
      (voucherCounts.get(voucher.replenishment_id) ?? 0) + 1,
    );
  }

  const rows: ReplenishmentListRow[] = replenishments.map(
    (replenishment) => ({
      id: replenishment.id,
      request_no: replenishment.request_no,
      fund_name: fundNames.get(replenishment.fund_id) ?? "—",
      status: isReplenishmentStatus(replenishment.status)
        ? replenishment.status
        : "draft",
      total: String(replenishment.total),
      voucher_count: voucherCounts.get(replenishment.id) ?? 0,
      requested_by_name: replenishment.requested_by
        ? (requestedByNames.get(replenishment.requested_by) ?? "—")
        : "—",
      created_at: replenishment.created_at,
    }),
  );

  const eligibleByFund = new Map<string, { count: number; total: number }>();
  for (const voucher of eligibleResult.data) {
    const current = eligibleByFund.get(voucher.fund_id) ?? {
      count: 0,
      total: 0,
    };
    current.count += 1;
    current.total += Number(voucher.amount);
    eligibleByFund.set(voucher.fund_id, current);
  }

  const fundOptions: ReplenishmentFundOption[] = funds
    .filter(
      (fund) =>
        activeFundIds.has(fund.id) && (eligibleByFund.get(fund.id)?.count ?? 0) > 0,
    )
    .map((fund) => {
      const available = eligibleByFund.get(fund.id);
      return {
        fund_id: fund.id,
        fund_name: fund.name,
        voucher_count: available?.count ?? 0,
        total: String(available?.total ?? 0),
      };
    });

  const columns: ResponsiveListColumn<ReplenishmentListRow>[] = [
    {
      key: "request",
      header: "Request",
      cell: (replenishment) => (
        <Link
          href={`/pcf/replenishments/${replenishment.id}`}
          className="font-medium hover:underline"
        >
          {replenishment.request_no}
        </Link>
      ),
    },
    {
      key: "fund",
      header: "Fund",
      cell: (replenishment) => replenishment.fund_name,
    },
    {
      key: "created",
      header: "Created",
      cell: (replenishment) => formatDate(replenishment.created_at),
    },
    {
      key: "vouchers",
      header: "Vouchers",
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      cell: (replenishment) => replenishment.voucher_count,
    },
    {
      key: "total",
      header: "Total",
      headerClassName: "text-right",
      className: "text-right",
      cell: (replenishment) => <MoneyText value={replenishment.total} />,
    },
    {
      key: "status",
      header: "Status",
      cell: (replenishment) => (
        <ReplenishmentStatusBadge status={replenishment.status} />
      ),
    },
    {
      key: "requested_by",
      header: "Requested by",
      cell: (replenishment) => replenishment.requested_by_name,
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-0",
      className: "text-right",
      cell: (replenishment) => (
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={`/pcf/replenishments/${replenishment.id}`} />}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Replenishments"
        description="Bundle released cash into a request, review it, and restore the fund when it is closed."
        actions={
          canPerform(user.role, "replenishment.create") ? (
            <NewReplenishmentButton funds={fundOptions} />
          ) : null
        }
      />

      <ResponsiveList
        rows={rows}
        columns={columns}
        getRowKey={(replenishment) => replenishment.id}
        renderCard={(replenishment) => (
          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/pcf/replenishments/${replenishment.id}`}
                    className="font-medium hover:underline"
                  >
                    {replenishment.request_no}
                  </Link>
                  <p className="truncate text-sm text-muted-foreground">
                    {replenishment.fund_name}
                  </p>
                </div>
                <ReplenishmentStatusBadge status={replenishment.status} />
              </div>
              <div className="flex items-end justify-between gap-3 text-sm">
                <div className="text-muted-foreground">
                  <p>{formatDate(replenishment.created_at)}</p>
                  <p>
                    {replenishment.voucher_count}{" "}
                    {replenishment.voucher_count === 1 ? "voucher" : "vouchers"}
                  </p>
                </div>
                <MoneyText
                  value={replenishment.total}
                  className="text-base font-medium"
                />
              </div>
            </CardContent>
          </Card>
        )}
        empty={
          <EmptyState
            icon={RefreshCw}
            title="No replenishments yet"
            description="Create a request once released vouchers are waiting to be reimbursed."
          />
        }
      />
    </div>
  );
}

// The page streams in behind a skeleton, like every MAD page (data is read per request).
export default function ReplenishmentsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReplenishmentsPageContent />
    </Suspense>
  );
}
