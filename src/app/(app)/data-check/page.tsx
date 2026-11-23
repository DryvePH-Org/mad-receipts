import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireModule } from "@/lib/auth";
import { editsPapers } from "@/lib/roles";
import { loadReview } from "@/lib/docsbible/review-server";
import { loadSyncItems } from "@/lib/pricelist/sync-server";
import { DataCheckBoard } from "./data-check-board";

type Search = Promise<{ tab?: string }>;

export default function DataCheckPage({ searchParams }: { searchParams: Search }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Data check" description="Everything in MAD that needs a person to decide. Nothing is changed until you choose, and every choice is kept in the car's history." />
      <Suspense fallback={<PageSkeleton />}><Content searchParams={searchParams} /></Suspense>
    </div>
  );
}

async function Content({ searchParams }: { searchParams: Search }) {
  const user = await requireModule("register");
  const { tab } = await searchParams;
  const editsDocs = editsPapers(user.role);
  const seesDifferences = editsPapers(user.role);
  const [review, differences] = await Promise.all([loadReview().catch(() => []), seesDifferences ? loadSyncItems().catch(() => []) : Promise.resolve([])]);
  const t = tab === "move" ? "move" : tab === "differences" ? "differences" : undefined;
  return <DataCheckBoard review={review} differences={differences} canEdit={editsDocs} seesDifferences={seesDifferences} initial={t} />;
}
