import { Suspense } from "react";
import { TriangleAlert } from "lucide-react";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { getSellDashboard } from "@/lib/dashboard";
import { SELL_SHEET_ID, SheetError, sheetUrl } from "@/lib/dashboard/sheets";
import { formatDate } from "@/lib/dates";
import { PendingBoard, ReleasedBoard } from "../boards";
import { Empty, Grid, names, peso, Section, SheetProblem, Stat } from "../parts";

export default function SellDashboardPage() {
  return <Suspense fallback={<PageSkeleton />}><Content /></Suspense>;
}

async function Content() {
  await requireRole("admin", "approver");
  const settings = await getSettings();
  let d;
  try { d = await getSellDashboard(settings.dashboard); } catch (e) {
    return <SheetProblem message={e instanceof SheetError ? e.message : "Something went wrong reading the sales sheet. Try Refresh now."} url={sheetUrl(SELL_SHEET_ID)} />;
  }
  const pct = Math.round((d.releasedThisMonth / d.goal) * 100);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <Stat href="#released" label="Released this month" value={`${d.releasedThisMonth}/${d.goal}`} sub={`${pct}% of the goal`} />
        <Stat href="#today" label="Released today" value={String(d.releasedToday.length)} sub={peso(d.releasedToday.reduce((n, s) => n + (s.agreedPrice ?? 0), 0))} />
        <Stat href="#pending" label="Pending sales" value={String(d.pending.length)} tone="text-violet-700" sub={`${peso(d.pending.reduce((n, s) => n + (s.agreedPrice ?? 0), 0))} still to release`} />
        <Stat href="#pending" label="Overdue" value={`${d.overdue.length}/${d.pending.length}`} tone={d.overdue.length ? "text-destructive" : undefined} sub="pending sales past their deadline" />
        <Stat href="#pending" label="Paid at reservation" value={peso(d.pending.reduce((n, s) => n + (s.reservation ?? 0), 0))} sub="held on the pending sales" />
      </div>

      {d.overdue.length > 0 && (
        <div role="alert" className="flex gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-900 dark:bg-red-500/10 dark:text-red-200">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p><b className="font-medium">{d.overdue.length} of {d.pending.length} pending {d.pending.length === 1 ? "sale is" : "sales are"} past the deadline.</b> A sale counts as pending only while no newer row in the sheet says it was released or cancelled. The deadline is the cleaning date written in the sheet, or {` `}the reservation date plus the allowed days (Settings). Oldest: {d.overdue.slice(0, 3).map((p) => `${p.unit || p.plate} (${p.daysLate} days)`).join(", ")}.</p>
        </div>
      )}

      <Section id="today" title="Sales as of today" count={d.releasedToday.length} hint={`Released on ${formatDate(d.today)}.`}>
        {d.releasedToday.length === 0 ? <Empty>Nothing released today yet.</Empty> : (
          <Grid head={["Unit and plate", "Selling price", "Salesman and marketing", "Transaction and source", "Buyer"]} right={[1]}
            rows={d.releasedToday.map((s) => [<div key="u">{s.unit || "—"}<p className="font-mono text-xs font-normal text-muted-foreground">{s.plate}</p></div>, peso(s.agreedPrice ?? s.listingPrice),
              <div key="p">{names(s.salesman)}<p className="text-xs font-normal text-muted-foreground">Marketing: {names(s.marketing)}</p></div>, <div key="k">{s.kind}<p className="text-xs font-normal text-muted-foreground">{s.source || "No source"}</p></div>, s.buyer || "—"])} />
        )}
      </Section>

      <Section id="pending" title="Pending sales and reserves" count={d.pending.length} hint="Reserved or paid, but not released yet. Selling price − paid at reservation − the lender's loan = what the buyer still owes. The loan is paid by the lender when it is released, so it is not owed by the buyer.">
        <PendingBoard rows={d.pending} />
      </Section>

      <Section id="released" title="Released sales" count={d.releasedThisMonth} hint="Every released unit, from the sheet's newest row for each car. Pick a month, then search or filter.">
        <ReleasedBoard rows={d.released} defaultMonth={d.today.slice(0, 7)} />
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Scoreboard" hint="Entries, reservations and releases by salesperson, today and this month. Shared sales count half each.">
          {d.score.length === 0 ? <Empty>No entries this month yet.</Empty> : (
            <Grid head={["Salesperson", "Today: entries / reserved / released", "Month: entries / reserved / released", "Released ÷ entries"]} right={[3]}
              rows={d.score.map((s) => [names([s.name]), `${s.entriesToday} / ${s.reservedToday} / ${s.releasedToday}`, `${s.entriesMonth} / ${s.reservedMonth} / ${s.releasedMonth}`, s.conversion === null ? "—" : `${s.conversion}%`])} />
          )}
        </Section>
        <Section title="Leads this month" hint="Where this month's entries stand.">
          {d.entryStatuses.length === 0 ? <Empty>No entries this month yet.</Empty> : <Grid head={["Status", "Entries"]} right={[1]} rows={d.entryStatuses.map((e) => [e.status, String(e.count)])} />}
        </Section>
      </div>

      <Section title="Sales history" hint="Units released in each month, against that month's target (set by the Admin in Settings).">
        {d.history.length === 0 ? <Empty>No released sales found.</Empty> : <Grid head={["Month", "Released", "Of the goal", "Selling price"]} right={[1, 2, 3]} rows={d.history.map((h) => [h.month, String(h.released), `${h.released}/${h.goal}`, peso(h.amount)])} />}
      </Section>
    </div>
  );
}
