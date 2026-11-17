import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireModule } from "@/lib/auth";
import { readerMode } from "@/lib/docs/bot-scan";
import { loadSuggestions } from "@/lib/docsbible/add-unit-server";
import { AddFlow } from "./add-flow";

export default function AddDocumentsPage({ searchParams }: PageProps<"/documents/add">) {
  return (
    <div className="space-y-6">
      <PageHeader title="Add a car" description="Type the plate, the car's details, then the photos of its papers. The car is added to the Docs Bible, the photos go into its folder in Available units (made for you if it does not exist), and each one is read as it arrives." />
      <Suspense fallback={<PageSkeleton />}><Content searchParams={searchParams} /></Suspense>
    </div>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/documents/add">["searchParams"] }) {
  await requireModule("documents");
  const q = await searchParams;
  const initialPlate = typeof q.plate === "string" ? q.plate.toUpperCase().replace(/[^A-Z0-9 ]/g, "").slice(0, 12) : "";
  return <AddFlow initialPlate={initialPlate} botScans={readerMode() === "grokbot"} suggestions={await loadSuggestions().catch(() => ({ makes: [], colors: [], models: [] }))} />;
}
