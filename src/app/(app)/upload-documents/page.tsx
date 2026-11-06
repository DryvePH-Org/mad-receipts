import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireModule } from "@/lib/auth";
import { listUploadTargets } from "@/lib/docs/data";
import { UploadFlow } from "./upload-flow";

export default function UploadDocumentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Upload documents" description="Take a photo of the buyer's ID or the signed deed of sale. It goes straight into the car's Drive folder, using the plate number." />
      <Suspense fallback={<PageSkeleton />}><Content /></Suspense>
    </div>
  );
}

async function Content() {
  await requireModule("upload");
  const targets = await listUploadTargets();
  return <UploadFlow targets={targets} />;
}
