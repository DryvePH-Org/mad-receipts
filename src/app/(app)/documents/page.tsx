import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireModule } from "@/lib/auth";
import { listCarRows } from "@/lib/docs/data";
import { CarsBoard } from "./cars-board";

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Car documents" description="Every car's papers in Drive: what is there, what is missing, and what does not match. Move a car to Sold when its papers are in." />
      <Suspense fallback={<PageSkeleton />}><Content /></Suspense>
    </div>
  );
}

async function Content() {
  await requireModule("documents");
  const rows = await listCarRows();
  return <CarsBoard rows={rows} />;
}
