import { Suspense } from "react";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Pill } from "@/components/shared/status-badge";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { getBuyDashboard } from "@/lib/dashboard";
import { BUY_SHEET_ID, SheetError, sheetUrl } from "@/lib/dashboard/sheets";
import { daysBetween } from "@/lib/dates";
import { Empty, Grid, names, peso, Section, SheetProblem, Stat } from "../parts";

export default function BuyDashboardPage() {
  return <Suspense fallback={<PageSkeleton />}><Content /></Suspense>;
}

async function Content() {
  await requireRole("admin", "approver");
  let b;
  try { b = await getBuyDashboard(); } catch (e) {
    return <SheetProblem message={e instanceof SheetError ? e.message : "Something went wrong reading the buying sheet. Try Refresh now."} url={sheetUrl(BUY_SHEET_ID)} />;
  }
  const held = b.holds.reduce((n, h) => n + (h.holdAmount ?? 0), 0), owed = b.payables.reduce((n, p) => n + p.total, 0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <Stat label="Bought this month" value={String(b.month?.count ?? 0)} sub={b.month ? `${peso(b.month.total)} · ${b.month.tab}` : "No tab for this month yet"} />
        <Stat label="Purchases today" value={String(b.todayPurchases.length)} sub={peso(b.todayPurchases.reduce((n, p) => n + (p.price ?? 0), 0))} />
        <Stat label="On hold" value={String(b.holds.length)} tone="text-amber-700" sub={`${peso(held)} held`} />
        <Stat label="Payables" value={peso(owed)} tone="text-destructive" sub={`${b.payables.length} ${b.payables.length === 1 ? "unit" : "units"} still to pay`} />
        <Stat label="Paid from MAD Bank" value={peso(b.madBank.total)} sub={`${b.madBank.count} this month`} />
      </div>

      <Section title="For purchase today" count={b.todayPurchases.length} hint={`Units bought on ${formatDate(b.today)}.`}>
        {b.todayPurchases.length === 0 ? <Empty>Nothing bought today yet.</Empty> : (
          <Grid head={["Unit", "Plate", "Amount", "Purchaser", "Appraiser"]} right={[2]}
            rows={b.todayPurchases.map((p) => [p.unit || "—", p.plate, p.price !== null ? peso(p.price) : p.priceText || "—", names(p.team), names([p.appraiser].filter(Boolean))])} />
        )}
      </Section>

      <Section title="Hold (pending)" count={b.holds.length} hint="Money held on a unit while papers, a bank payoff or a balance are settled. Rows marked X in the sheet are settled and left out.">
        {b.holds.length === 0 ? <Empty>No holds waiting.</Empty> : (
          <Grid head={["Unit and remarks", "Hold amount", "Purchaser", "Held since", "Date of release"]} right={[1]}
            rows={b.holds.map((h) => [
              <div key="u"><span>{h.unit}</span> <span className="font-mono text-xs text-muted-foreground">{h.plate}</span>
                <p className="text-xs font-normal text-muted-foreground">{[h.lacking && `Lacking: ${h.lacking}`, h.bank && `Bank: ${h.bank}`, h.remarks].filter(Boolean).join(" · ") || "No remarks"}</p></div>,
              peso(h.holdAmount), names(h.purchaser),
              h.since ? <span key="s">{formatDate(h.since)} <span className="text-xs text-muted-foreground">({daysBetween(h.since, b.today)} days)</span></span> : "—",
              h.out ? formatDate(h.out) : <Pill key="o" tone="amber">Not out yet</Pill>,
            ])} />
        )}
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Scoreboard" hint="Units bought this month by who bought them. Shared units count half each.">
          {b.scoreboard.length === 0 ? <Empty>No purchases this month yet.</Empty> : <Grid head={["Purchaser", "Bought", "Amount"]} right={[1, 2]} rows={b.scoreboard.map((s) => [names([s.name]), String(s.bought), peso(s.amount)])} />}
        </Section>
        <Section title="Where the units came from" hint="This month's purchases by source.">
          {b.sources.length === 0 ? <Empty>No purchases this month yet.</Empty> : <Grid head={["Source", "Units"]} right={[1]} rows={b.sources.map((s) => [s.source, String(s.count)])} />}
        </Section>
      </div>

      <Section title="Payables" count={b.payables.length} hint="Still to pay on units that are on hold: the balance to the seller and any payoff to the bank.">
        {b.payables.length === 0 ? <Empty>Nothing to pay.</Empty> : (
          <Grid head={["Unit", "To the seller", "To the bank", "Total"]} right={[1, 2, 3]}
            rows={b.payables.map((p) => [<div key="u">{p.unit}<p className="text-xs font-normal text-muted-foreground">{names(p.purchaser)} · {p.plate}</p></div>, peso(p.toClient), p.toBank ? <span key="b">{peso(p.toBank)} <span className="text-xs text-muted-foreground">{p.bank}</span></span> : "—", peso(p.total)])} />
        )}
      </Section>

      <Section title="MAD Bank" count={b.madBank.count} hint="Purchases this month paid from MAD Bank. The sheet has no bank balance, so this shows what went out.">
        {b.madBank.items.length === 0 ? <Empty>No MAD Bank payments this month.</Empty> : (
          <Grid head={["Date", "Unit", "Amount", "How"]} right={[2]} rows={b.madBank.items.map((p) => [p.date ? formatDate(p.date) : "—", p.unit || p.plate, peso(p.price), p.bank])} />
        )}
      </Section>

      <Section title="Monthly purchase history" hint="Units and amounts from each month's tab, next to the team's own BUYING SUMMARY (bought, entries, batting average).">
        {b.history.length === 0 ? <Empty>No monthly tabs found.</Empty> : (
          <Grid head={["Month", "Units in the tab", "Amount", "Bought (summary)", "Entries", "Batting average"]} right={[1, 2, 3, 4, 5]}
            rows={[...b.history].reverse().map((h) => [h.month, String(h.count), peso(h.total), h.bought === null ? "—" : String(h.bought), h.entries === null ? "—" : String(h.entries), h.batting || "—"])} />
        )}
      </Section>
    </div>
  );
}
