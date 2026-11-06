import { Suspense } from "react";
import { PageSkeleton } from "@/components/pcf/shared/page-skeleton";
import Link from "next/link";
import { Wallet } from "lucide-react";

import {
  BalanceCard,
  type BalanceFund,
} from "@/components/pcf/dashboard/balance-card";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/pcf/shared/empty-state";
import { MoneyText } from "@/components/pcf/shared/money-text";
import { StatusBadge } from "@/components/pcf/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/pcf/auth";
import {
  formatDate,
  formatDateTime,
  formatMonth,
  monthStartInAppTz,
  todayInAppTz,
} from "@/lib/pcf/dates";
import { canPerform, ROLE_LABELS } from "@/lib/pcf/permissions";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { isVoucherStatus } from "@/lib/pcf/voucher-status";

function varianceClass(value: number) {
  return value === 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-destructive";
}

async function DashboardPageContent() {
  const user = await requireUser("/pcf");
  const firstName = user.full_name.split(" ")[0] || user.full_name;
  const isAdmin = user.role === "admin";
  const seesCash = user.role === "custodian" || isAdmin;
  const canApprove = canPerform(user.role, "voucher.approve");
  const canAccounting = canPerform(user.role, "replenishment.review");
  const monthStart = monthStartInAppTz();
  const today = todayInAppTz();

  const supabase = await createClient();

  let draftsQuery = supabase
    .from("vouchers")
    .select("id, pcv_number, payee, amount, voucher_date", { count: "exact" })
    .or("status.eq.draft,and(status.eq.approved,released_at.is.null)");
  if (!isAdmin) {
    draftsQuery = draftsQuery.eq("prepared_by", user.id);
  }

  const [
    balancesResult,
    fundsResult,
    profilesResult,
    draftsResult,
    flaggedResult,
    lastCountResult,
    pendingResult,
    recentResult,
    replenishmentsResult,
    spendResult,
  ] = await Promise.all([
    seesCash
      ? supabase
          .from("fund_balance_v")
          .select(
            "fund_id, name, fund_amount, released_vouchers_total, expected_cash, is_low",
          )
          .order("name")
      : null,
    seesCash || canAccounting
      ? supabase.from("funds").select("id, name, is_active").order("name")
      : null,
    seesCash || canAccounting
      ? supabase.from("profiles").select("id, full_name")
      : null,
    seesCash
      ? draftsQuery
          .order("voucher_date", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(5)
      : null,
    seesCash
      ? supabase
          .from("vouchers")
          .select(
            "id, pcv_number, payee, amount, reject_reason, voucher_date",
            { count: "exact" },
          )
          .eq("status", "rejected")
          .order("voucher_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(5)
      : null,
    seesCash
      ? supabase
          .from("cash_counts")
          .select(
            "fund_id, counted_cash, expected_cash, variance, note, counted_by, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : null,
    canApprove
      ? supabase
          .from("vouchers")
          .select("id, pcv_number, payee, amount, released_at, status", {
            count: "exact",
          })
          .in("status", ["submitted", "released"])
          .neq("prepared_by", user.id)
          .order("status", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(5)
      : null,
    canApprove
      ? supabase
          .from("vouchers")
          .select(
            "id, pcv_number, payee, amount, status, approved_at, updated_at, reject_reason",
          )
          .in("status", ["approved", "rejected"])
          .order("updated_at", { ascending: false })
          .limit(5)
      : null,
    canAccounting
      ? supabase
          .from("replenishments")
          .select("id, request_no, total, requested_by, fund_id, created_at", {
            count: "exact",
          })
          .eq("status", "submitted")
          .order("created_at", { ascending: true })
          .limit(5)
      : null,
    canAccounting
      ? supabase
          .from("vouchers")
          .select("amount")
          .gte("voucher_date", monthStart)
          .lte("voucher_date", today)
          .in("status", ["released", "approved", "rejected", "closed"])
          .not("released_at", "is", null)
      : null,
  ]);

  const error =
    balancesResult?.error ??
    fundsResult?.error ??
    profilesResult?.error ??
    draftsResult?.error ??
    flaggedResult?.error ??
    lastCountResult?.error ??
    pendingResult?.error ??
    recentResult?.error ??
    replenishmentsResult?.error ??
    spendResult?.error;
  if (error) throw new Error(error.message);

  const funds = fundsResult?.data ?? [];
  const fundNames = new Map(funds.map((fund) => [fund.id, fund.name]));
  const activeFundIds = new Set(
    funds.filter((fund) => fund.is_active).map((fund) => fund.id),
  );
  const profileNames = new Map(
    (profilesResult?.data ?? []).map((profile) => [
      profile.id,
      profile.full_name,
    ]),
  );

  const balanceFunds: BalanceFund[] = (balancesResult?.data ?? []).flatMap(
    (balance) => {
      if (!balance.fund_id || !activeFundIds.has(balance.fund_id)) return [];
      return [
        {
          fund_id: balance.fund_id,
          name: balance.name ?? "Fund",
          fund_amount: Number(balance.fund_amount ?? 0),
          released_vouchers_total: Number(
            balance.released_vouchers_total ?? 0,
          ),
          expected_cash: Number(balance.expected_cash ?? 0),
          is_low: Boolean(balance.is_low),
        },
      ];
    },
  );

  const drafts = draftsResult?.data ?? [];
  const draftCount = draftsResult?.count ?? drafts.length;

  const flagged = flaggedResult?.data ?? [];
  const flaggedCount = flaggedResult?.count ?? flagged.length;

  const lastCount = lastCountResult?.data ?? null;

  const pending = pendingResult?.data ?? [];
  const pendingCount = pendingResult?.count ?? pending.length;

  const recent = recentResult?.data ?? [];

  const replenishments = (replenishmentsResult?.data ?? []).map((repl) => ({
    ...repl,
    fund_name: fundNames.get(repl.fund_id) ?? "—",
    requested_by_name: repl.requested_by
      ? (profileNames.get(repl.requested_by) ?? "—")
      : "—",
  }));
  const replenishmentCount =
    replenishmentsResult?.count ?? replenishments.length;

  const monthSpend = (spendResult?.data ?? []).reduce(
    (total, voucher) => total + Number(voucher.amount),
    0,
  );
  const monthSpendCount = spendResult?.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${firstName}`}
        description="Your petty cash overview and next actions."
        actions={<Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>}
      />

      {balanceFunds.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2">
          {balanceFunds.map((fund) => (
            <BalanceCard key={fund.fund_id} fund={fund} />
          ))}
        </div>
      ) : seesCash ? (
        <EmptyState
          icon={Wallet}
          title={user.role === "custodian" ? "No fund assigned yet" : "No fund set up yet"}
          description={
            user.role === "custodian"
              ? "Ask an administrator to assign you a fund. It will appear here once they do."
              : "Create a fund under PCF → Funds, then assign it to a custodian under Users."
          }
        />
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        {seesCash ? (
          <Card>
            <CardHeader>
              <CardAction>
                <Badge>{draftCount}</Badge>
              </CardAction>
              <CardTitle>Drafts to release</CardTitle>
              <CardDescription>
                Prepared vouchers whose cash has not been handed out yet.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {drafts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No drafts waiting for release.
                </p>
              ) : (
                <ul className="space-y-3">
                  {drafts.map((voucher) => (
                    <li
                      key={voucher.id}
                      className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/pcf/vouchers/${voucher.id}`}
                          className="font-medium hover:underline"
                        >
                          {voucher.pcv_number}
                        </Link>
                        <p className="truncate text-sm text-muted-foreground">
                          {voucher.payee} · {formatDate(voucher.voucher_date)}
                        </p>
                      </div>
                      <MoneyText
                        value={voucher.amount}
                        className="shrink-0 text-sm font-medium"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/pcf/vouchers?status=draft" />}
              >
                View drafts
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        {canApprove ? (
          <Card>
            <CardHeader>
              <CardAction>
                <Badge>{pendingCount}</Badge>
              </CardAction>
              <CardTitle>Pending approvals</CardTitle>
              <CardDescription>
                Large vouchers to approve before release, then released
                vouchers to review. Oldest first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing waiting for approval or review.
                </p>
              ) : (
                <ul className="space-y-3">
                  {pending.map((voucher) => (
                    <li
                      key={voucher.id}
                      className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/pcf/vouchers/${voucher.id}`}
                          className="font-medium hover:underline"
                        >
                          {voucher.pcv_number}
                        </Link>
                        <p className="truncate text-sm text-muted-foreground">
                          {voucher.payee}
                          {voucher.status === "submitted"
                            ? " · needs approval before release"
                            : voucher.released_at
                              ? ` · released ${formatDate(voucher.released_at)}`
                              : ""}
                        </p>
                      </div>
                      <MoneyText
                        value={voucher.amount}
                        className="shrink-0 text-sm font-medium"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
            <CardFooter>
              <Button nativeButton={false} render={<Link href="/pcf/approvals" />}>
                Open queue
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        {seesCash ? (
          <Card>
            <CardHeader>
              <CardAction>
                <Badge variant="destructive">{flaggedCount}</Badge>
              </CardAction>
              <CardTitle>Flagged vouchers</CardTitle>
              <CardDescription>
                Cash stays counted until an admin voids or corrects these.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {flagged.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No flagged vouchers.
                </p>
              ) : (
                <ul className="space-y-3">
                  {flagged.map((voucher) => (
                    <li
                      key={voucher.id}
                      className="space-y-1 border-b border-border pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`/pcf/vouchers/${voucher.id}`}
                          className="font-medium hover:underline"
                        >
                          {voucher.pcv_number}
                        </Link>
                        <MoneyText
                          value={voucher.amount}
                          className="text-sm font-medium"
                        />
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {voucher.payee} · {formatDate(voucher.voucher_date)}
                      </p>
                      {voucher.reject_reason ? (
                        <p className="text-sm text-destructive">
                          {voucher.reject_reason}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}

        {seesCash ? (
          <Card>
            <CardHeader>
              <CardAction>
                <Badge variant="secondary">Last count</Badge>
              </CardAction>
              <CardTitle>Cash count</CardTitle>
              <CardDescription>
                The most recent physical cash count across funds.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!lastCount ? (
                <p className="text-sm text-muted-foreground">
                  No cash counts recorded yet.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="font-medium">
                    {fundNames.get(lastCount.fund_id) ?? "Fund"}
                  </p>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Counted</dt>
                      <dd>
                        <MoneyText value={lastCount.counted_cash} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Expected</dt>
                      <dd>
                        <MoneyText value={lastCount.expected_cash} />
                      </dd>
                    </div>
                  </dl>
                  <p className="text-sm">
                    Variance:{" "}
                    <MoneyText
                      value={lastCount.variance ?? 0}
                      className={cn(
                        "font-medium",
                        varianceClass(Number(lastCount.variance ?? 0)),
                      )}
                    />
                  </p>
                  {lastCount.note ? (
                    <p className="text-sm text-pretty text-muted-foreground">
                      {lastCount.note}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(lastCount.created_at)} ·{" "}
                    {profileNames.get(lastCount.counted_by) ?? "Unknown"}
                  </p>
                </div>
              )}
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/pcf/cash-count" />}
              >
                Record cash count
              </Button>
            </CardFooter>
          </Card>
        ) : null}

        {canApprove ? (
          <Card>
            <CardHeader>
              <CardTitle>Recent decisions</CardTitle>
              <CardDescription>
                The latest approvals and flags across the queue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No decisions yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {recent.map((voucher) => (
                    <li
                      key={voucher.id}
                      className="space-y-1 border-b border-border pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`/pcf/vouchers/${voucher.id}`}
                          className="font-medium hover:underline"
                        >
                          {voucher.pcv_number}
                        </Link>
                        <StatusBadge
                          status={
                            isVoucherStatus(voucher.status)
                              ? voucher.status
                              : "approved"
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                        <span className="truncate">{voucher.payee}</span>
                        <MoneyText
                          value={voucher.amount}
                          className="shrink-0 text-sm font-medium text-foreground"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(voucher.approved_at ?? voucher.updated_at)}
                      </p>
                      {voucher.status === "rejected" &&
                      voucher.reject_reason ? (
                        <p className="text-sm text-destructive">
                          {voucher.reject_reason}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}

        {canAccounting ? (
          <Card>
            <CardHeader>
              <CardAction>
                <Badge>{replenishmentCount}</Badge>
              </CardAction>
              <CardTitle>Replenishments to review</CardTitle>
              <CardDescription>
                Submitted requests waiting for accounting.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {replenishments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No submitted replenishments.
                </p>
              ) : (
                <ul className="space-y-3">
                  {replenishments.map((repl) => (
                    <li
                      key={repl.id}
                      className="space-y-1 border-b border-border pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`/pcf/replenishments/${repl.id}`}
                          className="font-medium hover:underline"
                        >
                          {repl.request_no}
                        </Link>
                        <MoneyText
                          value={repl.total}
                          className="text-sm font-medium"
                        />
                      </div>
                      <p className="truncate text-sm text-muted-foreground">
                        {repl.fund_name} · requested by{" "}
                        {repl.requested_by_name}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}

        {canAccounting ? (
          <Card>
            <CardHeader>
              <CardTitle>Monthly spend</CardTitle>
              <CardDescription>
                Vouchers dated in {formatMonth(monthStart)}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="font-heading text-3xl font-semibold">
                <MoneyText value={monthSpend} />
              </p>
              <p className="text-sm text-muted-foreground">
                {monthSpendCount === 1
                  ? "1 voucher with cash out this month."
                  : `${monthSpendCount} vouchers with cash out this month.`}
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

// The page streams in behind a skeleton, like every MAD page (data is read per request).
export default function DashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <DashboardPageContent />
    </Suspense>
  );
}
