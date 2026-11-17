import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireModule } from "@/lib/auth";
import { docsDb } from "@/lib/docsbible/review-server";

export default function DocsBiblePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Docs Bible" description="The register of every car's papers, now kept here instead of in the Google Sheet." />
      <Suspense fallback={<PageSkeleton />}><Content /></Suspense>
    </div>
  );
}

async function Content() {
  await requireModule("register");
  const db = docsDb();
  const [cars, open] = await Promise.all([
    db.from("docs_units_current").select("id", { count: "exact", head: true }),
    db.from("docs_review_items").select("id", { count: "exact", head: true }).eq("status", "open"),
  ]);
  return (
    <Card>
      <CardHeader><CardTitle>Where things stand</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p>{cars.count ?? 0} cars are in the register. The table that looks like the sheet is the next page to arrive; for now, settle the review list.</p>
        <Button nativeButton={false} render={<Link href="/docs-bible/review" />}>Review list{open.count ? ` (${open.count} open)` : ""}</Button>
      </CardContent>
    </Card>
  );
}
