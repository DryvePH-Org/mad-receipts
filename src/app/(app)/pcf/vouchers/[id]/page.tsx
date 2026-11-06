import { Suspense, type ComponentProps } from "react";
import { PageSkeleton } from "@/components/pcf/shared/page-skeleton";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Ban,
  CircleCheck,
  FileText,
  Flag,
  PackageCheck,
  Send,
  Wallet,
} from "lucide-react";

import { AuditDiffTable } from "@/components/pcf/audit/audit-diff-table";
import { PageHeader } from "@/components/layout/page-header";
import { PrintButton } from "@/components/pcf/layout/print-button";
import { MoneyText } from "@/components/pcf/shared/money-text";
import { StatusBadge } from "@/components/pcf/shared/status-badge";
import { ReceiptViewer } from "@/components/pcf/vouchers/receipt-viewer";
import { VoucherActions } from "@/components/pcf/vouchers/voucher-actions";
import { VoucherPrint } from "@/components/pcf/vouchers/voucher-print";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AUDIT_ACTION_LABELS,
  buildAuditDiff,
  isAuditAction,
} from "@/lib/pcf/audit";
import { requireUser } from "@/lib/pcf/auth";
import { formatDate, formatDateTime } from "@/lib/pcf/dates";
import { createClient } from "@/lib/supabase/server";
import {
  isVoucherStatus,
  type VoucherStatus,
} from "@/lib/pcf/voucher-status";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function VoucherDetailPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser("/pcf/vouchers");
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();

  const supabase = await createClient();
  const { data: voucher, error } = await supabase
    .from("vouchers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!voucher) notFound();

  const profileIds = [
    voucher.prepared_by,
    ...(voucher.approved_by ? [voucher.approved_by] : []),
  ];

  const [categoryResult, itemsResult, fundResult, profileResult] = await Promise.all([
    supabase.from("categories").select("id, name"),
    supabase
      .from("voucher_items")
      .select("position, particulars, amount, category_id")
      .eq("voucher_id", voucher.id)
      .order("position", { ascending: true }),
    supabase
      .from("funds")
      .select("name, approval_threshold")
      .eq("id", voucher.fund_id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds),
  ]);

  if (categoryResult.error) throw new Error(categoryResult.error.message);
  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (fundResult.error) throw new Error(fundResult.error.message);
  if (profileResult.error) throw new Error(profileResult.error.message);

  const names = new Map(
    profileResult.data.map((profile) => [profile.id, profile.full_name]),
  );
  const preparedByName = names.get(voucher.prepared_by) ?? "—";
  const approvedByName = voucher.approved_by
    ? (names.get(voucher.approved_by) ?? "—")
    : null;
  const categoryById = new Map(
    categoryResult.data.map((category) => [category.id, category.name]),
  );
  const lines = itemsResult.data.map((item) => ({
    particulars: item.particulars,
    amount: String(item.amount),
    category_name: categoryById.get(item.category_id) ?? "—",
  }));
  const distinctCategories = new Set(lines.map((line) => line.category_name));
  const categoryName =
    distinctCategories.size > 1
      ? "Multiple categories"
      : (categoryById.get(voucher.category_id) ?? "—");
  const fundName = fundResult.data?.name ?? "—";
  const approvalThreshold = fundResult.data?.approval_threshold ?? 3000;
  const status: VoucherStatus = isVoucherStatus(voucher.status)
    ? voucher.status
    : "draft";

  let receiptUrl: string | null = null;
  if (voucher.receipt_path) {
    const { data: signed } = await supabase.storage
      .from("receipts")
      .createSignedUrl(voucher.receipt_path, 3600);
    receiptUrl = signed?.signedUrl ?? null;
  }

  let paperUrl: string | null = null;
  if (voucher.paper_voucher_path) {
    const { data: signed } = await supabase.storage
      .from("receipts")
      .createSignedUrl(voucher.paper_voucher_path, 3600);
    paperUrl = signed?.signedUrl ?? null;
  }
  // Only ever link to Google's own domains, whatever is stored.
  const driveLink = (url: string | null) =>
    url && /^https:\/\/(drive|docs)\.google\.com\//.test(url) ? url : null;
  const receiptDriveUrl = driveLink(voucher.receipt_drive_url);
  const paperDriveUrl = driveLink(voucher.paper_drive_url);

  const events = buildTimeline({
    createdAt: voucher.created_at,
    submittedAt: voucher.submitted_at,
    returnedReason: status === "draft" ? voucher.reject_reason : null,
    releasedAt: voucher.released_at,
    approvedAt: voucher.approved_at,
    approvedByName,
    rejected: status === "rejected",
    rejectReason: voucher.reject_reason,
    closed: status === "closed" || Boolean(voucher.replenishment_id),
    voided: status === "void",
    voidReason: voucher.void_reason,
    preparedByName,
  });

  const canSeeHistory = user.role === "admin" || user.role === "accounting";
  let auditEntries: {
    id: number;
    actionLabel: string;
    actorName: string;
    createdAt: string;
    diffRows: ReturnType<typeof buildAuditDiff>;
  }[] = [];
  if (canSeeHistory) {
    const { data: auditData, error: auditError } = await supabase
      .from("audit_log")
      .select("id, action, actor_id, old_data, new_data, created_at")
      .eq("entity_type", "vouchers")
      .eq("entity_id", voucher.id)
      .order("created_at", { ascending: false });
    if (auditError) throw new Error(auditError.message);

    const actorIds = [
      ...new Set(
        auditData
          .map((entry) => entry.actor_id)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const actorNames = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: actorProfiles, error: actorError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", actorIds);
      if (actorError) throw new Error(actorError.message);
      for (const profile of actorProfiles) {
        actorNames.set(profile.id, profile.full_name ?? "—");
      }
    }

    auditEntries = auditData.map((entry) => ({
      id: entry.id,
      actionLabel: isAuditAction(entry.action)
        ? AUDIT_ACTION_LABELS[entry.action]
        : entry.action,
      actorName: entry.actor_id
        ? (actorNames.get(entry.actor_id) ?? "—")
        : "System",
      createdAt: entry.created_at,
      diffRows: buildAuditDiff(entry.old_data, entry.new_data),
    }));
  }

  return (
    <>
      <div className="space-y-6 print:hidden">
        <PageHeader
          title={voucher.pcv_number}
          description={`${voucher.payee} · ${formatDate(voucher.voucher_date)}`}
          actions={
            <>
              <StatusBadge status={status} />
              <PrintButton />
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/pcf/vouchers" />}
              >
                Back
              </Button>
            </>
          }
        />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Voucher</CardTitle>
                <CardDescription>{particularsSummary(voucher.particulars)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg bg-muted/40 px-4 py-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <MoneyText
                      value={String(voucher.amount)}
                      className="font-heading text-2xl font-semibold"
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {fundName} · {categoryName}
                  </p>
                </div>

                {status === "rejected" ? (
                  <Alert variant="destructive">
                    <Flag />
                    <AlertTitle>Flagged by the approver</AlertTitle>
                    <AlertDescription>
                      {voucher.reject_reason ??
                        "The approver flagged this voucher."}{" "}
                      Cash stays counted. Ask an admin to void or correct it.
                    </AlertDescription>
                  </Alert>
                ) : null}

                {status === "void" ? (
                  <Alert variant="destructive">
                    <Ban />
                    <AlertTitle>Voided</AlertTitle>
                    <AlertDescription>
                      {voucher.void_reason ?? "This voucher was voided."}
                    </AlertDescription>
                  </Alert>
                ) : null}

                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <Detail label="Voucher date" value={formatDate(voucher.voucher_date)} />
                  <Detail label="Payee" value={voucher.payee} />
                  <Detail label="Category" value={categoryName} />
                  <Detail label="Fund" value={fundName} />
                  <Detail label="Prepared by" value={preparedByName} />
                  <Detail
                    label="Cash released"
                    value={
                      voucher.released_at
                        ? formatDateTime(voucher.released_at)
                        : "Not yet released"
                    }
                  />
                  <Detail
                    label="Reviewed by"
                    value={
                      approvedByName
                        ? `${approvedByName}${
                            voucher.approved_at
                              ? ` · ${formatDateTime(voucher.approved_at)}`
                              : ""
                          }`
                        : "Pending review"
                    }
                  />
                  <Detail
                    label="Replenishment"
                    value={
                      voucher.replenishment_id
                        ? "Included in a replenishment"
                        : "Not yet included"
                    }
                  />
                </dl>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {lines.length > 1 ? `Particulars (${lines.length} lines)` : "Particulars"}
                  </p>
                  <ul className="divide-y divide-border rounded-md border border-border text-sm">
                    {lines.map((line, index) => (
                      <li
                        key={index}
                        className="flex items-start justify-between gap-4 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="whitespace-pre-wrap">{line.particulars}</p>
                          {lines.length > 1 ? (
                            <p className="text-xs text-muted-foreground">
                              {line.category_name}
                            </p>
                          ) : null}
                        </div>
                        <MoneyText value={line.amount} />
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Receipt</CardTitle>
                <CardDescription>
                  {voucher.receipt_path
                    ? "Signed link, valid for one hour."
                    : "No receipt photo on file."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ReceiptViewer
                  url={receiptUrl}
                  noReceiptReason={voucher.no_receipt_reason}
                />
                {receiptDriveUrl ? <DriveLink href={receiptDriveUrl} /> : null}
              </CardContent>
            </Card>

            {paperUrl ? (
              <Card>
                <CardHeader>
                  <CardTitle>Paper voucher</CardTitle>
                  <CardDescription>
                    Photo of the signed paper copy. Signed link, valid for one hour.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ReceiptViewer url={paperUrl} noReceiptReason={null} />
                  {paperDriveUrl ? <DriveLink href={paperDriveUrl} /> : null}
                </CardContent>
              </Card>
            ) : null}
          </div>

          <div className="space-y-6">
            <VoucherActions
              voucher={{
                id: voucher.id,
                fund_id: voucher.fund_id,
                payee: voucher.payee,
                amount: String(voucher.amount),
                status,
                released_at: voucher.released_at,
                approval_threshold: String(approvalThreshold),
                needs_approval: Number(voucher.amount) >= Number(approvalThreshold),
                prepared_by: voucher.prepared_by,
                receipt_path: voucher.receipt_path,
                no_receipt_reason: voucher.no_receipt_reason,
                replenishment_id: voucher.replenishment_id,
              }}
              viewer={{ id: user.id, role: user.role }}
            />

            {canSeeHistory ? (
              <Card>
                <CardHeader>
                  <CardTitle>Activity</CardTitle>
                  <CardDescription>
                    The summary timeline, or the full audit history.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="timeline">
                    <TabsList>
                      <TabsTrigger value="timeline">Timeline</TabsTrigger>
                      <TabsTrigger value="history">History</TabsTrigger>
                    </TabsList>
                    <TabsContent value="timeline" className="pt-4">
                      <Timeline events={events} />
                    </TabsContent>
                    <TabsContent value="history" className="space-y-4 pt-4">
                      {auditEntries.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No audit entries yet.
                        </p>
                      ) : (
                        auditEntries.map((entry) => (
                          <div key={entry.id} className="space-y-2">
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <p className="font-medium">
                                {entry.actionLabel} by {entry.actorName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(entry.createdAt)}
                              </p>
                            </div>
                            <AuditDiffTable rows={entry.diffRows} />
                          </div>
                        ))
                      )}
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Timeline</CardTitle>
                  <CardDescription>
                    Prepared, released, then reviewed.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Timeline events={events} />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <div className="hidden print:block">
        <VoucherPrint
          pcvNumber={voucher.pcv_number}
          fundName={fundName}
          voucherDate={voucher.voucher_date}
          payee={voucher.payee}
          lines={lines}
          amount={String(voucher.amount)}
          categoryName={categoryName}
          status={status}
          preparedByName={preparedByName}
          approvedByName={approvedByName}
          approvedAt={voucher.approved_at}
          releasedAt={voucher.released_at}
          noReceiptReason={voucher.no_receipt_reason}
          voidReason={voucher.void_reason}
        />
      </div>
    </>
  );
}

function Timeline({
  events,
}: {
  events: ReturnType<typeof buildTimeline>;
}) {
  return (
    <ol className="space-y-4">
      {events.map((event) => {
        const Icon = event.icon;
        return (
          <li key={event.key} className="flex gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium">{event.label}</p>
              {event.at ? (
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(event.at)}
                </p>
              ) : null}
              {event.detail ? (
                <p className="text-xs text-muted-foreground">
                  {event.detail}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}

function DriveLink({ href }: { href: string }) {
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      Also saved in{" "}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-foreground underline underline-offset-2"
      >
        Google Drive
      </a>
      .
    </p>
  );
}

function particularsSummary(particulars: string) {
  return particulars.length > 80
    ? `${particulars.slice(0, 80).trimEnd()}…`
    : particulars;
}

function buildTimeline({
  createdAt,
  submittedAt,
  returnedReason,
  releasedAt,
  approvedAt,
  approvedByName,
  rejected,
  rejectReason,
  closed,
  voided,
  voidReason,
  preparedByName,
}: {
  createdAt: string;
  submittedAt: string | null;
  returnedReason: string | null;
  releasedAt: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  rejected: boolean;
  rejectReason: string | null;
  closed: boolean;
  voided: boolean;
  voidReason: string | null;
  preparedByName: string;
}) {
  const events: {
    key: string;
    label: string;
    at?: string | null;
    detail?: string;
    icon: typeof FileText;
  }[] = [
    {
      key: "prepared",
      label: "Prepared",
      at: createdAt,
      detail: `by ${preparedByName}`,
      icon: FileText,
    },
  ];

  // Approved before the cash went out (or before it was released at all).
  const preApproved = Boolean(
    approvedAt && (!releasedAt || approvedAt < releasedAt),
  );

  if (returnedReason) {
    events.push({
      key: "returned",
      label: "Returned by the approver",
      detail: returnedReason,
      icon: Flag,
    });
  }

  if (submittedAt) {
    events.push({
      key: "submitted",
      label: "Submitted for approval",
      at: submittedAt,
      detail: "No cash goes out until an approver approves it.",
      icon: Send,
    });
  }

  if (preApproved) {
    events.push({
      key: "pre-approved",
      label: "Approved before release",
      at: approvedAt,
      detail: approvedByName ? `by ${approvedByName}` : undefined,
      icon: CircleCheck,
    });
  }

  if (releasedAt) {
    events.push({
      key: "released",
      label: "Cash released",
      at: releasedAt,
      detail: preApproved
        ? "Cash left the fund after approval."
        : "Cash left the fund and the approver was notified.",
      icon: Wallet,
    });
  }

  if (approvedAt && !preApproved) {
    events.push({
      key: "approved",
      label: "Reviewed and approved",
      at: approvedAt,
      detail: approvedByName ? `by ${approvedByName}` : undefined,
      icon: CircleCheck,
    });
  }

  if (rejected) {
    events.push({
      key: "flagged",
      label: "Flagged by the approver",
      detail: rejectReason ?? undefined,
      icon: Flag,
    });
  }

  if (closed) {
    events.push({
      key: "closed",
      label: "Closed in a replenishment",
      icon: PackageCheck,
    });
  }

  if (voided) {
    events.push({
      key: "voided",
      label: "Voided",
      detail: voidReason ?? undefined,
      icon: Ban,
    });
  }

  return events;
}

// The page streams in behind a skeleton, like every MAD page (data is read per request).
export default function VoucherDetailPage(props: ComponentProps<typeof VoucherDetailPageContent>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <VoucherDetailPageContent {...props} />
    </Suspense>
  );
}
