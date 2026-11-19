import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireModule } from "@/lib/auth";
import { manilaToday } from "@/lib/dates";
import { loadRepairs } from "@/lib/repairs/server";
import { RepairsBoard } from "./repairs-board";

export default function RepairsPage() {
  return <div className="space-y-6"><Suspense fallback={<PageSkeleton />}><Content /></Suspense></div>;
}

async function Content() {
  const user = await requireModule("repairs");
  const repairs = await loadRepairs();
  const canDecide = user.role === "approver" || user.role === "admin";
  return (
    <>
      <PageHeader title="Repairs" description="Every repair report on the cars. Everyone can see them; only the Approver approves or rejects a report and updates a job. An approved job that is not done keeps its car marked For repair." />
      <RepairsBoard repairs={repairs} today={manilaToday()} canDecide={canDecide} />
    </>
  );
}
