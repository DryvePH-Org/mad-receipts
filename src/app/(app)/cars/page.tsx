import { Suspense } from "react";
import { Download, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/lib/auth";
import { docsDb } from "@/lib/docsbible/review-server";
import { forRole } from "@/lib/cars/model";
import { carsSheetUrl, loadCars, type CarsData } from "@/lib/cars/read";
import { loadDocsSummaries } from "@/lib/docs/summary";
import { CarsBoard } from "./cars-board";

export default function CarsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Car status" description="Every car in the inventory: can it be sold, is it being repaired, how long has it been here. Read from the MAD Pricelist; the sheet is still where changes are made." />
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
        <p>{e instanceof Error ? e.message : "The inventory could not be read."} Try again in a moment.</p>
      </div>
    );
  }
  const docs = Object.fromEntries(await loadDocsSummaries().catch(() => new Map()));
  const canOpenSheet = user.role === "admin" || user.role === "approver";
  // the Excel copy in the price list's layout, once the price list is in the database (Admin and Approver)
  const inApp = canOpenSheet ? await docsDb().from("car_stock").select("unit_id", { count: "exact", head: true }).then((r) => (r.error ? 0 : r.count ?? 0), () => 0) : 0;
  return (
    <>
      {inApp > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" nativeButton={false} render={<a href="/api/cars/export" download />}><Download /> Download Excel (price list layout)</Button>
        </div>
      )}
      <CarsBoard cars={data.cars.map((c) => forRole(c, user.role))} at={data.at} stale={data.stale} role={user.role} docs={docs} sheetUrl={canOpenSheet ? carsSheetUrl() : null} canOpenDocs={user.role === "admin" || user.role === "documentation"} />
    </>
  );
}
