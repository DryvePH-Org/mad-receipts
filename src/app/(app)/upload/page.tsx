import { Suspense } from "react";
import { Lightbulb } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { UploadFlow } from "./upload-flow";

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Upload receipt"
        description="Take a clear photo of the paper receipt. The form is filled in for you to check."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <Suspense fallback={<PageSkeleton />}>
          <UploadForUser />
        </Suspense>
        <PhotoTips />
      </div>
    </div>
  );
}

async function UploadForUser() {
  const user = await requireUser();
  return (
    <Card>
      <CardContent>
        <UploadFlow userId={user.id} />
      </CardContent>
    </Card>
  );
}

function PhotoTips() {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lightbulb className="size-4 text-muted-foreground" aria-hidden /> Photo tips
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted-foreground">
          <li>Fill the frame with the receipt and hold the phone straight above it.</li>
          <li>Use good light and avoid glare on the paper.</li>
          <li>Make sure the red receipt number and the plate number are sharp.</li>
          <li>One receipt per photo.</li>
        </ul>
      </CardContent>
    </Card>
  );
}
