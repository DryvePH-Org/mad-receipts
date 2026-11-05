import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { SettingsEditor } from "./settings-editor";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Control every list and option the form uses. Changes apply to the next receipt that is filled in." />
      <Suspense fallback={<PageSkeleton />}><Content /></Suspense>
    </div>
  );
}

async function Content() {
  await requireAdmin();
  return <SettingsEditor initial={await getSettings()} />;
}
