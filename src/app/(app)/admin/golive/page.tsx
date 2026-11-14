import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireAdmin, requireModule } from "@/lib/auth";
import { ChecksPanel } from "./checks-panel";

export default function GoLivePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Go-live check" description="Everything the documents workflow depends on, compared with what it expects: the settings, the database, the sheets and their columns, the Drive folders. Run it when the test copies are replaced by the real ones, and after any change to a sheet. It only reads; it changes nothing." />
      <Suspense fallback={<PageSkeleton />}><Content /></Suspense>
    </div>
  );
}

async function Content() {
  await requireAdmin();
  await requireModule("sync");
  return <ChecksPanel />;
}
