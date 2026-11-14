import { Suspense } from "react";
import { TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireModule } from "@/lib/auth";
import { forRole } from "@/lib/cars/model";
import { carsSheetUrl, loadCars, type CarsData } from "@/lib/cars/read";
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
  const canOpenSheet = user.role === "admin" || user.role === "approver";
  return (
    <CarsBoard cars={data.cars.map((c) => forRole(c, user.role))} at={data.at} stale={data.stale} role={user.role} sheetUrl={canOpenSheet ? carsSheetUrl() : null} canOpenDocs={user.role === "admin" || user.role === "documentation"} />
  );
}
