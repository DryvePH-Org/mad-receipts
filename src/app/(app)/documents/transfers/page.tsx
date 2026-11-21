import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireRole } from "@/lib/auth";
import { manilaToday } from "@/lib/dates";
import { isOpen } from "@/lib/transfers/model";
import { loadTransfers } from "@/lib/transfers/server";
import { TransferList } from "./transfer-list";

export default function TransfersPage() {
  return <div className="space-y-6"><Suspense fallback={<PageSkeleton />}><Content /></Suspense></div>;
}

async function Content() {
  await requireRole("admin", "approver", "documentation");
  const { transfers, cars } = await loadTransfers();
  const open = transfers.filter(isOpen).length, check = transfers.filter((t) => t.flags.length > 0).length;
  return (
    <>
      <PageHeader title="Sales and transfers" description={`Every sold car and its OR/CR transfer: ${transfers.length} in all, ${open} not delivered yet, ${check} with something to check. Open one to change it. A record is linked to its car by plate; one whose car is not in Car documents yet is linked when that car is added.`} />
      <TransferList transfers={transfers} cars={Object.fromEntries(cars)} today={manilaToday()} />
    </>
  );
}
