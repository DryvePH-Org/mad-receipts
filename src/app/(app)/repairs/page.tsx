import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireModule } from "@/lib/auth";
import { pageNote } from "@/lib/page-notes";
import { editsCars, isSuper } from "@/lib/roles";
import { manilaToday } from "@/lib/dates";
import { loadRepairs } from "@/lib/repairs/server";
import { docsDb } from "@/lib/docsbible/review-server";
import { botStateAction } from "./bot-actions";
import { ChainPanel } from "./chain-panel";
import { PeoplePanel } from "./people-panel";
import { loadChain } from "@/lib/repairs/approval-chain";
import { loadChainChoices } from "@/lib/repairs/chain-choices";
import { RepairsBoard } from "./repairs-board";

export default function RepairsPage() {
  return <div className="space-y-6"><Suspense fallback={<PageSkeleton />}><Content /></Suspense></div>;
}

async function Content() {
  const user = await requireModule("repairs");
  const canDecide = editsCars(user.role);
  const sup = isSuper(user.role);
  // everything is asked at the same time
  const [repairs, peopleRows, chainRows, candidates, webhook] = await Promise.all([
    loadRepairs(),
    sup ? docsDb().from("repair_people").select("tg_id, name, role").eq("active", true).order("name").then((r) => r.data ?? []) : null,
    sup ? loadChain().catch(() => []) : null,
    sup ? loadChainChoices().catch(() => []) : null,
    sup && process.env.REPAIRS_TELEGRAM_BOT_TOKEN ? botStateAction() : null,
  ]);
  const people = peopleRows ? peopleRows.map((p) => ({ tgId: Number(p.tg_id), name: p.name as string, role: p.role as string })) : null;
  const chain = chainRows && candidates ? { initial: chainRows.map((c) => ({ userId: c.userId, waitMinutes: c.waitMinutes })), candidates } : null;
  return (
    <>
      <PageHeader title="Repairs" description="Every repair report on the cars. An approved job that cannot be displayed and is not done keeps its car marked For repair." />
      <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{pageNote("repairs", user.role)}</p>
      {chain && <ChainPanel candidates={chain.candidates} initial={chain.initial} />}
      {people && <PeoplePanel people={people} botReady={!!process.env.REPAIRS_TELEGRAM_BOT_TOKEN} webhook={webhook} />}
      <RepairsBoard repairs={repairs} today={manilaToday()} canDecide={canDecide} />
    </>
  );
}
