import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireModule } from "@/lib/auth";
import { AddFlow } from "./add-flow";

export default function AddDocumentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Add documents" description="Type the plate number and add the photos. They go into the car's folder in Available units (made for you if it does not exist), and each one is read as it arrives." />
      <Suspense fallback={<PageSkeleton />}><Content /></Suspense>
    </div>
  );
}

async function Content() {
  await requireModule("documents");
  return <AddFlow />;
}
