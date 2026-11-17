import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireModule } from "@/lib/auth";
import { loadReview } from "@/lib/docsbible/review-server";
import { ReviewBoard } from "./review-board";

export default function ReviewPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Review list" description="Things the move from the Google Sheet could not decide by itself. Settle each one; nothing is changed until you do, and every choice is kept in the car's history." />
      <Suspense fallback={<PageSkeleton />}><Content /></Suspense>
    </div>
  );
}

async function Content() {
  const user = await requireModule("register");
  const items = await loadReview();
  return <ReviewBoard items={items} canEdit={user.role === "admin" || user.role === "documentation"} />;
}
