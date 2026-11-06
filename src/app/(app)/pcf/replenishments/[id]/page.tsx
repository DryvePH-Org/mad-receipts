import { Suspense, type ComponentProps } from "react";
import { PageSkeleton } from "@/components/pcf/shared/page-skeleton";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock, XCircle } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { PrintButton } from "@/components/pcf/layout/print-button";
import { MoneyText } from "@/components/pcf/shared/money-text";
import { ReplenishmentStatusBadge } from "@/components/pcf/shared/replenishment-status-badge";
import {
  ResponsiveList,
  type ResponsiveListColumn,
} from "@/components/pcf/shared/responsive-list";
import { ReplenishmentActions } from "@/components/pcf/replenishments/replenishment-actions";
import { ReplenishmentPrint } from "@/components/pcf/replenishments/replenishment-print";
import type { ReplenishmentVoucherRow } from "@/components/pcf/replenishments/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/pcf/auth";
import { formatDate, formatDateTime } from "@/lib/pcf/dates";
import { isReplenishmentStatus } from "@/lib/pcf/replenishment-status";
import { createClient } from "@/lib/supabase/server";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ReplenishmentDetailPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser("/pcf/replenishments");
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();

  const supabase = await createClient();
  const { data: replenishment, error } = await supabase
    .from("replenishments")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!replenishment) notFound();

  const profileIds = [
    replenishment.requested_by,
    replenishment.reviewed_by,
  ].filter((value): value is string => Boolean(value));

  const [
    fundResult,
    vouchersResult,
    categoriesResult,
    profilesResult,
  ] = await Promise.all([
    supabase
      .from("funds")
      .select("name")
      .eq("id", replenishment.fund_id)
      .maybeSingle(),
    supabase
      .from("vouchers")
      .select(
        "id, pcv_number, voucher_date, payee, particulars, amount, category_id, receipt_path, no_receipt_reason, voucher_items(amount, category_id)",
      )
      .eq("replenishment_id", replenishment.id)
      .order("voucher_date", { ascending: true })
      .order("pcv_number", { ascending: true }),
    supabase.from("categories").select("id, name"),
    supabase.from("profiles").select("id, full_name").in("id", profileIds),
  ]);

  if (fundResult.error) throw new Error(fundResult.error.message);
  if (vouchersResult.error) throw new Error(vouchersResult.error.message);
  if (categoriesResult.error) throw new Error(categoriesResult.error.message);
  if (profilesResult.error) throw new Error(profilesResult.error.message);

  const vouchersData = vouchersResult.data;
  const profileNames = new Map(
    profilesResult.data.map((profile) => [profile.id, profile.full_name]),
  );
  const categoryNames = new Map(
    categoriesResult.data.map((category) => [category.id, category.name]),
  );

  const receiptUrls = new Map<string, string | null>();
  await Promise.all(
    vouchersData.map(async (voucher) => {
      if (!voucher.receipt_path) {
        receiptUrls.set(voucher.id, null);
        return;
      }
      const { data: signed } = await supabase.storage
        .from("receipts")
        .createSignedUrl(voucher.receipt_path, 3600);
      receiptUrls.set(voucher.id, signed?.signedUrl ?? null);
    }),
  );

  const vouchers: ReplenishmentVoucherRow[] = vouchersData.map((voucher) => {
    const lines = (
      voucher.voucher_items.length
        ? voucher.voucher_items
        : [{ amount: voucher.amount, category_id: voucher.category_id }]
    ).map((line) => ({
      amount: String(line.amount),
      category_name: categoryNames.get(line.category_id) ?? "—",
    }));
    const distinct = new Set(lines.map((line) => line.category_name));
    return {
      id: voucher.id,
      pcv_number: voucher.pcv_number,
      voucher_date: voucher.voucher_date,
      payee: voucher.payee,
      particulars: voucher.particulars,
      amount: String(voucher.amount),
      category_id: voucher.category_id,
      category_name:
        distinct.size > 1
          ? "Multiple categories"
          : (categoryNames.get(voucher.category_id) ?? "—"),
      lines,
      receipt_url: receiptUrls.get(voucher.id) ?? null,
      no_receipt_reason: voucher.no_receipt_reason,
    };
  });

  const categoryTotals = buildCategoryTotals(vouchers);
  const fundName = fundResult.data?.name ?? "—";
  const requestedByName = replenishment.requested_by
    ? (profileNames.get(replenishment.requested_by) ?? "—")
    : "—";
  const reviewedByName = replenishment.reviewed_by
    ? (profileNames.get(replenishment.reviewed_by) ?? "—")
    : null;
  const status = isReplenishmentStatus(replenishment.status)
    ? replenishment.status
    : "draft";

  const columns: ResponsiveListColumn<ReplenishmentVoucherRow>[] = [
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
      key: "receipt",
      header: "Receipt",
      cell: (voucher) => <ReceiptThumb voucher={voucher} />,
    },
    {
      key: "amount",
      header: "Amount",
      headerClassName: "text-right",
      className: "text-right",
      cell: (voucher) => <MoneyText value={voucher.amount} />,
    },
  ];

  return (
    <>
      <div className="space-y-6 print:hidden">
        <PageHeader
          title={replenishment.request_no}
          description={`${fundName} · requested ${formatDateTime(replenishment.created_at)}`}
          actions={
            <>
              <ReplenishmentStatusBadge status={status} />
              <PrintButton />
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/pcf/replenishments" />}
              >
                Back
              </Button>
            </>
          }
        />

        {status === "rejected" ? (
          <Alert variant="destructive">
            <XCircle />
            <AlertTitle>Rejected by accounting</AlertTitle>
            <AlertDescription>
              {replenishment.review_note ?? "This request was rejected."} The
              vouchers were returned to the pool and can be bundled into a new
              request.
            </AlertDescription>
          </Alert>
        ) : null}

        {status === "closed" ? (
          <Alert>
            <Lock />
            <AlertTitle>Closed and fund restored</AlertTitle>
            <AlertDescription>
              The included vouchers are closed and expected cash is back to the
              full fund amount.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Included vouchers</CardTitle>
                <CardDescription>
                  {vouchers.length}{" "}
                  {vouchers.length === 1 ? "voucher" : "vouchers"} in this
                  request.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {vouchers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {status === "rejected"
                      ? "The vouchers were returned to the pool when this request was rejected."
                      : "No vouchers are linked to this request."}
                  </p>
                ) : (
                  <ResponsiveList
                    rows={vouchers}
                    columns={columns}
                    getRowKey={(voucher) => voucher.id}
                    renderCard={(voucher) => (
                      <Card>
                        <CardContent className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <Link
                              href={`/pcf/vouchers/${voucher.id}`}
                              className="font-medium hover:underline"
                            >
                              {voucher.pcv_number}
                            </Link>
                            <MoneyText
                              value={voucher.amount}
                              className="font-medium"
                            />
                          </div>
                          <p className="truncate text-sm text-muted-foreground">
                            {voucher.payee}
                          </p>
                          <div className="flex items-end justify-between gap-3 text-sm text-muted-foreground">
                            <div>
                              <p>{formatDate(voucher.voucher_date)}</p>
                              <p>{voucher.category_name}</p>
                            </div>
                            <ReceiptThumb voucher={voucher} />
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Totals by category</CardTitle>
                <CardDescription>
                  Every voucher in this request, grouped by category.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {categoryTotals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No voucher totals to show.
                  </p>
                ) : (
                  <dl className="divide-y">
                    {categoryTotals.map((category) => (
                      <div
                        key={category.name}
                        className="flex items-center justify-between gap-3 py-2 text-sm"
                      >
                        <dt>
                          {category.name}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {category.count}{" "}
                            {category.count === 1 ? "voucher" : "vouchers"}
                          </span>
                        </dt>
                        <dd>
                          <MoneyText value={category.amount} />
                        </dd>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-3 py-2 text-sm font-semibold">
                      <dt>Total</dt>
                      <dd>
                        <MoneyText value={String(replenishment.total)} />
                      </dd>
                    </div>
                  </dl>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Request</CardTitle>
                <CardDescription>{fundName}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-muted/40 px-4 py-3">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <MoneyText
                    value={String(replenishment.total)}
                    className="font-heading text-2xl font-semibold"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {vouchers.length}{" "}
                    {vouchers.length === 1 ? "voucher" : "vouchers"}
                  </p>
                </div>

                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-1">
                  <Detail
                    label="Requested by"
                    value={`${requestedByName} · ${formatDateTime(replenishment.created_at)}`}
                  />
                  <Detail
                    label="Reviewed by"
                    value={
                      reviewedByName
                        ? `${reviewedByName}${
                            replenishment.reviewed_at
                              ? ` · ${formatDateTime(replenishment.reviewed_at)}`
                              : ""
                          }`
                        : "Not yet reviewed"
                    }
                  />
                </dl>

                {replenishment.review_note ? (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Review note
                    </p>
                    <p className="text-sm whitespace-pre-wrap">
                      {replenishment.review_note}
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <ReplenishmentActions
              replenishment={{
                id: replenishment.id,
                status,
                requested_by: replenishment.requested_by,
              }}
              viewer={{ id: user.id, role: user.role }}
            />
          </div>
        </div>
      </div>

      <div className="hidden print:block">
        <ReplenishmentPrint
          requestNo={replenishment.request_no}
          fundName={fundName}
          createdAt={replenishment.created_at}
          status={status}
          total={String(replenishment.total)}
          vouchers={vouchers.map((voucher) => ({
            pcv_number: voucher.pcv_number,
            voucher_date: voucher.voucher_date,
            payee: voucher.payee,
            category_name: voucher.category_name,
            amount: voucher.amount,
          }))}
          categoryTotals={categoryTotals.map((category) => ({
            name: category.name,
            amount: category.amount,
          }))}
          requestedByName={requestedByName}
          reviewedByName={reviewedByName}
          reviewedAt={replenishment.reviewed_at}
          reviewNote={replenishment.review_note}
        />
      </div>
    </>
  );
}

function ReceiptThumb({ voucher }: { voucher: ReplenishmentVoucherRow }) {
  if (!voucher.receipt_url) {
    return (
      <span
        className="text-xs text-muted-foreground"
        title={voucher.no_receipt_reason ?? undefined}
      >
        No receipt
      </span>
    );
  }

  return (
    <Link
      href={`/pcf/vouchers/${voucher.id}`}
      className="inline-block"
      aria-label={`View receipt for ${voucher.pcv_number}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={voucher.receipt_url}
        alt={`Receipt for ${voucher.pcv_number}`}
        className="h-10 w-10 rounded border object-cover"
        loading="lazy"
      />
    </Link>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function buildCategoryTotals(vouchers: ReplenishmentVoucherRow[]) {
  const totals = new Map<string, { count: number; centavos: number }>();
  for (const voucher of vouchers) {
    // A voucher counts once per category it touches; each line adds its own amount.
    const touched = new Set<string>();
    for (const line of voucher.lines) {
      const current = totals.get(line.category_name) ?? { count: 0, centavos: 0 };
      if (!touched.has(line.category_name)) {
        current.count += 1;
        touched.add(line.category_name);
      }
      current.centavos += Math.round(Number(line.amount) * 100);
      totals.set(line.category_name, current);
    }
  }

  return [...totals.entries()]
    .map(([name, total]) => ({
      name,
      count: total.count,
      amount: String(total.centavos / 100),
      centavos: total.centavos,
    }))
    .sort((a, b) => b.centavos - a.centavos);
}

// The page streams in behind a skeleton, like every MAD page (data is read per request).
export default function ReplenishmentDetailPage(props: ComponentProps<typeof ReplenishmentDetailPageContent>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReplenishmentDetailPageContent {...props} />
    </Suspense>
  );
}
