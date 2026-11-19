import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireModule } from "@/lib/auth";
import { manilaToday } from "@/lib/dates";
import { loadRepairs } from "@/lib/repairs/server";
import { docsDb } from "@/lib/docsbible/review-server";
import { PeoplePanel } from "./people-panel";
import { RepairsBoard } from "./repairs-board";

export default function RepairsPage() {
  return <div className="space-y-6"><Suspense fallback={<PageSkeleton />}><Content /></Suspense></div>;
}

async function Content() {
  const user = await requireModule("repairs");
  const repairs = await loadRepairs();
  const canDecide = user.role === "approver" || user.role === "admin";
  const people = user.role === "admin" ? ((await docsDb().from("repair_people").select("tg_id, name, role").eq("active", true).order("name")).data ?? []).map((p) => ({ tgId: Number(p.tg_id), name: p.name as string, role: p.role as string })) : null;
  return (
    <>
      <PageHeader title="Repairs" description="Every repair report on the cars. Everyone can see them; only the Approver approves or rejects a report and updates a job. An approved job that is not done keeps its car marked For repair." />
      {people && <PeoplePanel people={people} botReady={!!process.env.REPAIRS_TELEGRAM_BOT_TOKEN} />}
      <RepairsBoard repairs={repairs} today={manilaToday()} canDecide={canDecide} />
    </>
  );
}
