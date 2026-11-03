import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireUser } from "@/lib/auth";

async function Shell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto min-h-svh max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <PageSkeleton />
        </div>
      }
    >
      <Shell>{children}</Shell>
    </Suspense>
  );
}
