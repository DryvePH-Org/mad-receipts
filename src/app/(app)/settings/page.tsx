import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireModule } from "@/lib/auth";
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
  const user = await requireModule("settings");
  // wiping data stays with the Admin role, even for someone who was given Settings
  return <SettingsEditor initial={await getSettings()} canDelete={user.role === "admin"} />;
}
