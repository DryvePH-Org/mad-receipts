import { Suspense } from "react";
import Link from "next/link";
import { Download, ExternalLink, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/lib/auth";
import { docsDb } from "@/lib/docsbible/review-server";
import { countOpenSyncItems } from "@/lib/pricelist/sync-server";
import { forRole } from "@/lib/cars/model";
import { loadCars, orcrSheetUrl, type CarsData } from "@/lib/cars/read";
import { loadDocsSummaries } from "@/lib/docs/summary";
import { CarsBoard } from "./cars-board";

export default function CarsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Car status" description="Every car in stock: can it be sold, is it being repaired, how long has it been here. This is the app’s own list: Admin and Approver change prices and status here." />
      <Suspense fallback={<PageSkeleton />}><Content /></Suspense>
    </div>
  );
}

async function Content() {
  const user = await requireModule("cars");
  let data: CarsData;
  try {
    data = await loadCars();
  } catch (e) {
    return (
      <div role="alert" className="flex gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>{e instanceof Error ? e.message : "Car status could not be read."} Try again in a moment.</p>
      </div>
    );
  }
  const docs = Object.fromEntries(await loadDocsSummaries().catch(() => new Map()));
  const canOpenSheet = user.role === "admin" || user.role === "approver"; // the same two roles edit the price list
  // the Excel copy in the price list's layout, once the price list is in the database (Admin and Approver)
  const inApp = canOpenSheet ? await docsDb().from("docs_units").select("id", { count: "exact", head: true }).eq("in_stock", true).then((r) => (r.error ? 0 : r.count ?? 0), () => 0) : 0;
  const canCheck = user.role === "admin" || user.role === "approver" || user.role === "documentation";
  const openChecks = canCheck ? await countOpenSyncItems() : 0;
  const orcr = orcrSheetUrl();
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted p-3 text-sm">
        <p className="min-w-0 flex-1">ORCR transfers to buyers are kept in MAD now, linked to the car: Car documents, then Transfers.</p>
        {canCheck && <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/documents/transfers" />}>Open Transfers</Button>}
        {orcr && <Button size="sm" variant="ghost" nativeButton={false} render={<a href={orcr} target="_blank" rel="noreferrer" />}><ExternalLink /> Old sheet</Button>}
      </div>
      {(openChecks > 0 || (canCheck && inApp > 0)) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="min-w-0 flex-1">{openChecks > 0 ? `${openChecks} places where Car status and Car documents do not say the same thing.` : "Car status and Car documents agree."}</p>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/data-check?tab=differences" />}>Open the data check</Button>
        </div>
      )}
      {inApp > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" nativeButton={false} render={<a href="/api/cars/export" download />}><Download /> Download Excel</Button>
        </div>
      )}
      <CarsBoard cars={data.cars.map((c) => forRole(c, user.role))} role={user.role} docs={docs} canEdit={canOpenSheet} canOpenDocs={user.role === "admin" || user.role === "documentation"} />
    </>
  );
}
