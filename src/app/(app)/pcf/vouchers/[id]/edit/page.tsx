import { Suspense, type ComponentProps } from "react";
import { PageSkeleton } from "@/components/pcf/shared/page-skeleton";
import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { VoucherForm } from "@/components/pcf/vouchers/voucher-form";
import type { CategoryOption, FundOption } from "@/components/pcf/vouchers/types";
import { requireUser } from "@/lib/pcf/auth";
import { createClient } from "@/lib/supabase/server";

async function EditVoucherPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser(`/pcf/vouchers/${id}/edit`);
  const supabase = await createClient();

  const { data: voucher, error } = await supabase
    .from("vouchers")
    .select("id, fund_id, status, prepared_by, voucher_date, payee, pcv_number")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!voucher) notFound();
  // Only the preparer can correct a draft; everything else is read-only.
  if (voucher.status !== "draft" || voucher.prepared_by !== user.id) {
    redirect(`/pcf/vouchers/${id}`);
  }

  const [itemsResult, fundResult, categoriesResult] = await Promise.all([
    supabase
      .from("voucher_items")
      .select("particulars, amount, category_id")
      .eq("voucher_id", id)
      .order("position", { ascending: true }),
    supabase
      .from("funds")
      .select("id, name, per_txn_limit, approval_threshold")
      .eq("id", voucher.fund_id)
      .single(),
    supabase
      .from("categories")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
  ]);
  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (fundResult.error) throw new Error(fundResult.error.message);
  if (categoriesResult.error) throw new Error(categoriesResult.error.message);

  const fund: FundOption = {
    id: fundResult.data.id,
    name: fundResult.data.name,
    per_txn_limit: String(fundResult.data.per_txn_limit),
    approval_threshold: String(fundResult.data.approval_threshold),
  };
  const categories: CategoryOption[] = categoriesResult.data.map((category) => ({
    id: category.id,
    name: category.name,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit ${voucher.pcv_number}`}
        description="Correct the payee, date or lines of this draft. The receipt and release stay on the voucher page."
      />
      <VoucherForm
        funds={[fund]}
        categories={categories}
        edit={{
          id: voucher.id,
          fund_id: voucher.fund_id,
          voucher_date: voucher.voucher_date,
          payee: voucher.payee,
          items: itemsResult.data.map((item) => ({
            particulars: item.particulars,
            amount: Number(item.amount).toFixed(2),
            category_id: item.category_id,
          })),
        }}
      />
    </div>
  );
}

// The page streams in behind a skeleton, like every MAD page (data is read per request).
export default function EditVoucherPage(props: ComponentProps<typeof EditVoucherPageContent>) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditVoucherPageContent {...props} />
    </Suspense>
  );
}
