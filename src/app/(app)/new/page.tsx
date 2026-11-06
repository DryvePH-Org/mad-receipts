import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireModule } from "@/lib/auth";
import { getDeal, getSettings, listDeals } from "@/lib/data";
import { manilaToday } from "@/lib/dates";
import { inventory } from "@/lib/inventory";
import { param } from "@/lib/search";
import { ReceiptForm, type ContinueDeal, type LiveDeal } from "./receipt-form";
import type { InvUnit } from "./inventory-picker";

export default function NewReceiptPage({ searchParams }: PageProps<"/new">) {
  return (
    <div className="space-y-6">
      <PageHeader title="New acknowledgement of payment" description="Five short steps. Fill in what you know, check it, then send it to the Approver." />
      <Suspense fallback={<PageSkeleton />}><Content searchParams={searchParams} /></Suspense>
    </div>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/new">["searchParams"] }) {
  const user = await requireModule("new");
  const wanted = param((await searchParams).deal);
  const [settings, deals, units] = await Promise.all([getSettings(), listDeals(), inventory.listUnits().catch(() => [])]);
  const live: LiveDeal[] = deals.filter((d) => d.status === "open" && d.balance > 0).map((d) => ({
    id: d.id, dealNo: d.dealNo, buyerName: d.buyerName, plateNos: d.units.map((u) => u.plate_no), receiptCount: d.approvedCount + d.pendingCount,
    committed: d.openingPaid + d.approvedPaid + d.pendingPaid, balance: d.balance,
  }));
  const found = wanted ? await getDeal(wanted) : null;
  const cont: ContinueDeal | null = found && found.status === "open" ? {
    id: found.id, dealNo: found.dealNo, buyerName: found.buyerName, receiptCount: found.approvedCount + found.pendingCount,
    committed: found.openingPaid + found.approvedPaid + found.pendingPaid, terms: found.terms,
  } : null;
  const invUnits: InvUnit[] = units.map((u) => ({ plate: u.plate, makeType: u.makeType, color: u.color, motor: u.motor, chassis: u.chassis, status: u.status }));
  return <ReceiptForm key={cont?.id ?? "new"} userId={user.id} today={manilaToday()} settings={settings} inventory={invUnits} liveDeals={live} continueDeal={cont} />;
}
