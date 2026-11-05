import { Suspense } from "react";
import { TriangleAlert } from "lucide-react";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Pill, type Tone } from "@/components/shared/status-badge";
import { requireRole } from "@/lib/auth";
import { getSellDashboard } from "@/lib/dashboard";
import type { Alert, Sale } from "@/lib/dashboard/sell";
import { SELL_SHEET_ID, SheetError, sheetUrl } from "@/lib/dashboard/sheets";
import { formatDate } from "@/lib/dates";
import { Empty, Grid, names, peso, Section, SheetProblem, Stat } from "../parts";

export default function SellDashboardPage() {
  return <Suspense fallback={<PageSkeleton />}><Content /></Suspense>;
}

const ALERT: Record<Alert, [Tone, string]> = { overdue: ["red", "Overdue"], "due-today": ["amber", "Due today"], soon: ["amber", "Due soon"], none: ["grey", "On time"] };
const sub = "text-xs font-normal text-muted-foreground";
/** Unit with its plate underneath. */
const unit = (s: Sale) => <div key="u">{s.unit || "—"}{s.transmission && <span className={sub}> {s.transmission}</span>}<p className={`font-mono ${sub}`}>{s.plate}</p></div>;
const price = (s: Sale) => peso(s.agreedPrice ?? s.listingPrice);
/** Salesman, with the marketing person underneath. */
const staff = (s: Sale) => <div key="p">{names(s.salesman)}<p className={sub}>Marketing: {names(s.marketing)}</p></div>;
/** The kind of transaction, with the source underneath. */
const how = (s: Sale) => <div key="k">{s.kind}<p className={sub}>{s.source || "No source"}</p></div>;

async function Content() {
  await requireRole("admin", "approver");
  let d;
  try { d = await getSellDashboard(); } catch (e) {
    return <SheetProblem message={e instanceof SheetError ? e.message : "Something went wrong reading the sales sheet. Try Refresh now."} url={sheetUrl(SELL_SHEET_ID)} />;
  }
  const month = d.score.reduce((n, s) => n + s.releasedMonth, 0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <Stat label="Released today" value={String(d.releasedToday.length)} sub={peso(d.releasedToday.reduce((n, s) => n + (s.agreedPrice ?? 0), 0))} />
        <Stat label="Released this month" value={String(Math.round(month * 10) / 10)} sub={`${d.today.slice(0, 7)}`} />
        <Stat label="Pending sales" value={String(d.pending.length)} tone="text-violet-700" sub={peso(d.pending.reduce((n, s) => n + (s.agreedPrice ?? 0), 0))} />
        <Stat label="Overdue" value={String(d.overdue.length)} tone={d.overdue.length ? "text-destructive" : undefined} sub="past their deadline" />
        <Stat label="Reserved money" value={peso(d.reserves.reduce((n, s) => n + (s.reservation ?? 0), 0))} sub={`${d.reserves.length} reservations`} />
      </div>

      {d.overdue.length > 0 && (
        <div role="alert" className="flex gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-900 dark:bg-red-500/10 dark:text-red-200">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p><b className="font-medium">{d.overdue.length} pending {d.overdue.length === 1 ? "sale is" : "sales are"} past the deadline.</b> The deadline is the cleaning date written in the sheet, or 14 days after the reservation when none is written. The oldest: {d.overdue.slice(0, 3).map((p) => `${p.unit || p.plate} (${p.daysLate} days)`).join(", ")}.</p>
        </div>
      )}

      <Section title="Sales as of today" count={d.releasedToday.length} hint={`Released on ${formatDate(d.today)}.`}>
        {d.releasedToday.length === 0 ? <Empty>Nothing released today yet.</Empty> : (
          <Grid head={["Unit and plate", "Selling price", "Salesman and marketing", "Transaction and source", "Buyer"]} right={[1]}
            rows={d.releasedToday.map((s) => [unit(s), price(s), staff(s), how(s), s.buyer || "—"])} />
        )}
      </Section>

      <Section title="Accumulated pending sales" count={d.pending.length} hint="Reserved or paid but not released yet. The deadline is the cleaning date in the sheet, or the reservation date plus 14 days when none is written.">
        {d.pending.length === 0 ? <Empty>No pending sales.</Empty> : (
          <Grid head={["Unit and plate", "Deadline", "Selling price", "Salesman and marketing", "Transaction and source", "Buyer"]} right={[2]}
            rows={d.pending.map((s) => [unit(s),
              <div key="d" className="space-y-0.5"><Pill tone={ALERT[s.alert][0]}>{s.alert === "overdue" ? `${ALERT.overdue[1]} ${s.daysLate}d` : ALERT[s.alert][1]}</Pill>{s.due && <p className="text-xs font-normal text-muted-foreground">{formatDate(s.due)} · {s.dueSource}</p>}</div>,
              price(s), staff(s), how(s), s.buyer || "—"])} />
        )}
      </Section>

      <Section title="Reserves" count={d.reserves.length} hint="Reservations: what was put down, what is still to pay, and who is financing.">
        {d.reserves.length === 0 ? <Empty>No reservations.</Empty> : (
          <Grid head={["Unit and plate", "Reservation", "Balance", "Financing", "Release / deadline", "Salesman", "Status"]} right={[1, 2]}
            rows={d.reserves.map((s) => [unit(s), <div key="r">{peso(s.reservation)}<p className={sub}>{s.reservationDate || "—"}</p></div>, peso(s.balance),
              s.financingFirm ? `${s.financingFirm} ${peso(s.financingAmount)}` : "Cash", s.releaseDate ? formatDate(s.releaseDate) : s.deadline ? formatDate(s.deadline) : "—", names(s.salesman),
              <Pill key="s" tone={s.status === "FULLY PAID" ? "emerald" : "purple"}>{s.status || "RESERVATION"}</Pill>])} />
        )}
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Scoreboard" hint="Entries, reservations and releases by salesperson, today and this month. Shared sales count half each.">
          {d.score.length === 0 ? <Empty>No entries this month yet.</Empty> : (
            <Grid head={["Salesperson", "Today (entries / reserved / released)", "Month (entries / reserved / released)", "Conversion"]} right={[3]}
              rows={d.score.map((s) => [names([s.name]), `${s.entriesToday} / ${s.reservedToday} / ${s.releasedToday}`, `${s.entriesMonth} / ${s.reservedMonth} / ${s.releasedMonth}`, s.conversion === null ? "—" : `${s.conversion}%`])} />
          )}
        </Section>
        <Section title="Leads this month" hint="Where this month's entries stand.">
          {d.entryStatuses.length === 0 ? <Empty>No entries this month yet.</Empty> : <Grid head={["Status", "Entries"]} right={[1]} rows={d.entryStatuses.map((e) => [e.status, String(e.count)])} />}
        </Section>
      </div>

      <Section title="Sales history" hint="Units released in each month, with their selling price.">
        {d.history.length === 0 ? <Empty>No released sales found.</Empty> : <Grid head={["Month", "Released", "Amount"]} right={[1, 2]} rows={d.history.map((h) => [h.month, String(h.released), peso(h.amount)])} />}
      </Section>
    </div>
  );
}
