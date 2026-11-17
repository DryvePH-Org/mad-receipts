import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/lib/auth";
import { loadGrid } from "@/lib/docsbible/grid-server";
import { docsDb } from "@/lib/docsbible/review-server";
import { DocsGrid } from "./docs-grid";

export default function DocsBiblePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Docs Bible" description="Every car's papers in one table, like the Google Sheet it replaces. Click a cell to change it." />
      <Suspense fallback={<PageSkeleton />}><Content /></Suspense>
    </div>
  );
}

async function Content() {
  const user = await requireModule("register");
  const [rows, open] = await Promise.all([loadGrid(), docsDb().from("docs_review_items").select("id", { count: "exact", head: true }).eq("status", "open")]);
  return (
    <div className="space-y-4">
      {(open.count ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
          <p className="min-w-0 flex-1">{open.count} things from the move still need a decision (same plate twice, different statuses, missing classification...).</p>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/docs-bible/review" />}>Open the review list</Button>
        </div>
      )}
      <DocsGrid initial={rows} role={user.role} />
    </div>
  );
}
