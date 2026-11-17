import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireModule } from "@/lib/auth";
import { loadSuggestions } from "@/lib/docsbible/add-unit-server";
import { AddFlow } from "./add-flow";

export default function AddDocumentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Add a car" description="Type the plate, the car's details, then the photos of its papers. The car is added to the Docs Bible, the photos go into its folder in Available units (made for you if it does not exist), and each one is read as it arrives." />
      <Suspense fallback={<PageSkeleton />}><Content /></Suspense>
    </div>
  );
}

async function Content() {
  await requireModule("documents");
  return <AddFlow suggestions={await loadSuggestions().catch(() => ({ makes: [], colors: [], models: [] }))} />;
}
