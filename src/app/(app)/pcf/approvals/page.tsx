import { Suspense } from "react";
import { PageSkeleton } from "@/components/pcf/shared/page-skeleton";
import { ClipboardCheck } from "lucide-react";

import { ApprovalsBoard } from "@/components/pcf/approvals/approvals-board";
import type { ApprovalItem } from "@/components/pcf/approvals/types";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/pcf/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/pcf/auth";
import { createClient } from "@/lib/supabase/server";

async function ApprovalsPageContent() {
  const user = await requireUser("/pcf/approvals");
  const supabase = await createClient();

  const { data: vouchers, error } = await supabase
    .from("vouchers")
    .select(
      "id, pcv_number, voucher_date, payee, particulars, amount, category_id, fund_id, receipt_path, no_receipt_reason, prepared_by, released_at, submitted_at, status",
    )
    .in("status", ["submitted", "released"])
    .neq("prepared_by", user.id)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

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

  const preparedByIds = [...new Set(vouchers.map((voucher) => voucher.prepared_by))];
  const preparedByNames = new Map<string, string>();
  if (preparedByIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", preparedByIds);
    if (profileError) throw new Error(profileError.message);
    for (const profile of profiles) {
      preparedByNames.set(profile.id, profile.full_name ?? "—");
    }
  }

  const receiptUrls = new Map<string, string | null>();
  await Promise.all(
    vouchers.map(async (voucher) => {
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

  const mapped: ApprovalItem[] = vouchers.map((voucher) => ({
    kind: voucher.status === "submitted" ? "pre" : "post",
    submitted_at: voucher.submitted_at,
    id: voucher.id,
    pcv_number: voucher.pcv_number,
    voucher_date: voucher.voucher_date,
    payee: voucher.payee,
    particulars: voucher.particulars,
    amount: String(voucher.amount),
    category_name: categoryNames.get(voucher.category_id) ?? "—",
    fund_name: fundNames.get(voucher.fund_id) ?? "—",
    prepared_by: voucher.prepared_by,
    prepared_by_name: preparedByNames.get(voucher.prepared_by) ?? "—",
    released_at: voucher.released_at,
    receipt_url: receiptUrls.get(voucher.id) ?? null,
    no_receipt_reason: voucher.no_receipt_reason,
  }));

  // Requests that block cash come first; each group is oldest first.
  const waitingSince = (item: ApprovalItem) =>
    item.kind === "pre" ? item.submitted_at : item.released_at;
  const items = [...mapped].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "pre" ? -1 : 1;
    return (waitingSince(a) ?? "").localeCompare(waitingSince(b) ?? "");
  });
  const preCount = items.filter((item) => item.kind === "pre").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        description="Large vouchers need your approval before any cash goes out. Smaller ones are already released and just need a review. Oldest first."
        actions={
          <Badge variant={preCount > 0 ? "default" : "secondary"}>
            {preCount > 0
              ? `${preCount} to approve · ${items.length - preCount} to review`
              : `${items.length} waiting`}
          </Badge>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Queue clear"
          description="Large vouchers appear here for approval before release, and released vouchers appear here for review."
        />
      ) : (
        <ApprovalsBoard items={items} viewerId={user.id} />
      )}
    </div>
  );
}

// The page streams in behind a skeleton, like every MAD page (data is read per request).
export default function ApprovalsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ApprovalsPageContent />
    </Suspense>
  );
}
