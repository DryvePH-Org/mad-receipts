import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireRole } from "@/lib/auth";
import { loadSyncItems } from "@/lib/pricelist/sync-server";
import { SyncBoard } from "./sync-board";

export default function PriceListCheckPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Price list check" description="Where the MAD Price List and the Docs Bible do not say the same thing about a car. For each one, choose which is right: the other one is brought in line. Nothing changes until you choose." />
      <Suspense fallback={<PageSkeleton />}><Content /></Suspense>
    </div>
  );
}

async function Content() {
  await requireRole("admin", "approver", "documentation");
  const items = await loadSyncItems().catch(() => null);
  if (!items) return <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">The price list check is not available yet. It appears once the price list has been moved into the app.</p>;
  return <SyncBoard items={items} />;
}
