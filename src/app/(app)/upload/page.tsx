import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { UploadFlow } from "./upload-flow";

export default function UploadPage() {
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">Upload receipt</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <UploadForUser />
      </Suspense>
    </div>
  );
}

async function UploadForUser() {
  const user = await requireUser();
  return <UploadFlow userId={user.id} />;
}
