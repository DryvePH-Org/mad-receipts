import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/lib/auth";
import { loadUnified } from "@/lib/docsbible/unified-server";
import { docsDb } from "@/lib/docsbible/review-server";
import { listSavedCopies } from "@/lib/docsbible/export-server";
import { DocumentsBoard } from "./documents-board";

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Car documents" description="Every car's papers in one place: the list with quick information, or the table that looks like the old sheet. Click a car for its photos and details." />
      <Suspense fallback={<PageSkeleton />}><Content /></Suspense>
    </div>
  );
}

async function Content() {
  const user = await requireModule("register"); // inside Suspense: reading the signed-in person is request data
  const role = user.role, canAct = user.modules.includes("documents");
  const [{ rows, grid }, open, copies] = await Promise.all([
    loadUnified(),
    docsDb().from("docs_review_items").select("id", { count: "exact", head: true }).eq("status", "open"),
    role === "admin" ? listSavedCopies().catch(() => []) : Promise.resolve([]),
  ]);
  return (
    <div className="space-y-4">
      {canAct && <div className="flex flex-wrap gap-2"><Button nativeButton={false} render={<Link href="/documents/add" />}>Add documents</Button><Button variant="outline" nativeButton={false} render={<Link href="/documents/handoff" />}>Documents on handoff</Button></div>}
      <DocumentsBoard rows={rows} grid={grid} role={role} canAct={canAct} openDecisions={open.count ?? 0} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Button size="sm" variant="outline" nativeButton={false} render={<a href="/api/docs-bible/export" download />}>Download as CSV (sheet layout)</Button>
        <span className="text-muted-foreground">Opens in Google Sheets or Excel with the same columns as the old sheet.</span>
      </div>
      {role === "admin" && (
        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Saved copies ({copies.length})</summary>
          <p className="mt-2 text-muted-foreground">One copy is saved every day and kept for 30 days.</p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">{copies.map((c) => <li key={c.name}><a className="underline underline-offset-2" href={`/api/docs-bible/export?copy=${encodeURIComponent(c.name)}`}>{c.name}</a>{c.size ? <span className="text-muted-foreground"> · {Math.round(c.size / 1024)} KB</span> : null}</li>)}</ul>
          {copies.length === 0 && <p className="mt-2 text-muted-foreground">The first copy is saved by the next scheduled run.</p>}
        </details>
      )}
    </div>
  );
}
