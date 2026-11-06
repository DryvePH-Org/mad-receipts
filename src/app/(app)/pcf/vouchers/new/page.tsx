import { Suspense, type ComponentProps } from "react";
import { PageSkeleton } from "@/components/pcf/shared/page-skeleton";
import { ReceiptText } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/pcf/shared/empty-state";
import { VoucherForm } from "@/components/pcf/vouchers/voucher-form";
import type { CategoryOption, FundOption } from "@/components/pcf/vouchers/types";
import { requireUser } from "@/lib/pcf/auth";
import { createClient } from "@/lib/supabase/server";

async function NewVoucherPageContent({
  searchParams,
}: {
  searchParams: Promise<{ scan?: string }>;
}) {
  const { scan } = await searchParams;
  const user = await requireUser("/pcf/vouchers/new");
  const supabase = await createClient();

  const [fundsResult, categoriesResult] = await Promise.all([
    supabase
      .from("funds")
      .select("id, name, per_txn_limit, approval_threshold")
      .eq("is_active", true)
      .order("created_at"),
    supabase
      .from("categories")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
  ]);

  if (fundsResult.error) throw new Error(fundsResult.error.message);
  if (categoriesResult.error) throw new Error(categoriesResult.error.message);

  const funds: FundOption[] = fundsResult.data.map((fund) => ({
    id: fund.id,
    name: fund.name,
    per_txn_limit: String(fund.per_txn_limit),
    approval_threshold: String(fund.approval_threshold),
  }));
  const categories: CategoryOption[] = categoriesResult.data.map(
    (category) => ({ id: category.id, name: category.name }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="New voucher"
        description="Record a petty cash expense. Saving and releasing cash hands the money out before the approver reviews it."
      />

      {funds.length === 0 || categories.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={
            funds.length === 0 && user.role === "custodian"
              ? "No fund assigned yet"
              : "Setup needed first"
          }
          description={
            funds.length === 0 && user.role === "custodian"
              ? "Ask an administrator to assign you a fund before recording a voucher."
              : "Add at least one active fund and category before recording a voucher."
          }
        />
      ) : (
        <VoucherForm
          funds={funds}
          categories={categories}
          highlightScan={scan === "1"}
        />
      )}
    </div>
  );
}

// The page streams in behind a skeleton, like every MAD page (data is read per request).
export default function NewVoucherPage(props: ComponentProps<typeof NewVoucherPageContent>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewVoucherPageContent {...props} />
    </Suspense>
  );
}
