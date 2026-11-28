import { Suspense } from "react";
import Link from "next/link";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { requireRole } from "@/lib/auth";
import { loadPaymentsData } from "@/lib/payments/sync";
import { PASSBOOK_SHEET_ID, sheetUrl } from "@/lib/dashboard/sheets";
import { STAGE_LABEL } from "@/lib/payments/parse";
import { buildPayments } from "@/lib/payments/summary";
import { Empty, Section, Stat } from "../parts";
import { HBars, LineChart, StackedBars, VIZ_STYLE, peso } from "./charts";
import { RefreshPayments } from "./refresh-button";

export default function PaymentsPage({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  return <Suspense fallback={<PageSkeleton />}><Content searchParams={searchParams} /></Suspense>;
}

const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", year: "2-digit", timeZone: "UTC" });
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
const ago = (iso: string | null) => { if (!iso) return "never"; const m = Math.round((Date.now() - Date.parse(iso)) / 60_000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

async function Content({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  await requireRole("super_admin"); // bank balances and account numbers: the Super Admin only, for now
  const want = (await searchParams).month;
  const data = await loadPaymentsData().catch(() => null);
  if (!data || data.lines.length === 0) {
    return (
      <div className="space-y-4">
        <Empty>Nothing has been copied from the payments sheet yet. {data ? `${data.synced.tabs} tabs are known${data.synced.failing ? `, ${data.synced.failing} with a problem` : ""}.` : "MAD could not read its copy (has migration 78 been applied?)."} Press the button to copy the newest months; the older ones follow by themselves. The sheet must be reachable through the Google Apps Script bridge (its ALLOWED_SHEET_IDS), and the script&apos;s Google account must be able to open it.</Empty>
        <RefreshPayments />
      </div>
    );
  }
  const s = buildPayments(data.lines, data.pays, typeof want === "string" ? want : null);
  const unlabelled = data.lines.filter((l) => l.date.slice(0, 7) === s.month && (!l.type || l.type === "UNLABELLED")).slice(0, 8);
  const noAr = data.pays.filter((p) => p.date?.slice(0, 7) === s.month && ["reservation", "additional", "full"].includes(p.stage) && !p.arNo).slice(0, 8);
  const accounts = s.accounts.map((a) => a.account);
  return (
    <div className="viz-root space-y-6">
      <style>{VIZ_STYLE}</style>
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Month" className="flex flex-wrap gap-1">
          {s.months.slice().reverse().map((m) => <Link key={m} href={`/dashboard/payments?month=${m}`} aria-current={m === s.month ? "page" : undefined} className={`rounded-md px-3 py-1 text-sm ${m === s.month ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{monthLabel(m)}</Link>)}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Copied from the sheet {ago(data.synced.latest)}{data.synced.failing > 0 && <span className="text-destructive"> · {data.synced.failing} tab{data.synced.failing === 1 ? "" : "s"} with a problem</span>}
          <a className="underline underline-offset-2" href={sheetUrl(PASSBOOK_SHEET_ID)} target="_blank" rel="noreferrer">Open the sheet</a>
          <RefreshPayments />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Money in" value={peso(s.totals.in)} sub={`${s.totals.lines} bank lines`} tone="text-emerald-700 dark:text-emerald-300" />
        <Stat label="Money out" value={peso(s.totals.out)} sub="refunds, fees, splits…" />
        <Stat label="Net of the month" value={peso(s.totals.net)} />
        {s.accounts.map((a) => <Stat key={a.account} label={`${a.account} balance`} value={a.balance === null ? "—" : peso(a.balance)} sub={`in ${peso(a.in)} · out ${peso(a.out)}`} />)}
      </div>

      <Section title="Money in by bank, month by month" hint="Every deposit into each bank account, by month. The number on top is the month's total.">
        <StackedBars label="Money in by bank for each month" series={accounts.map((name) => ({ name }))} categories={s.perMonth.map((m) => ({ label: monthLabel(m.month), parts: accounts.map((a) => m.byAccount[a] ?? 0) }))} />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="What the money was for" hint={`${s.month ? monthLabel(s.month) : ""}: the type written on each bank line.`}>
          <HBars label="Money in and out by type" items={s.byType.map((t) => ({ label: t.key, in: t.in, out: t.out }))} />
        </Section>
        <Section title="How the money moved" hint={`${s.month ? monthLabel(s.month) : ""}: cash deposit, memos, transfers, checks (from the code on each line).`}>
          <HBars label="Money in and out by way of payment" items={s.byMode.map((t) => ({ label: t.key, in: t.in, out: t.out }))} />
        </Section>
      </div>

      <Section title="The month, day by day" hint="The running net: money in minus money out, from the first day of the month.">
        {s.daily.length ? <LineChart label="Running net of the month" points={s.daily.map((d) => ({ label: dayLabel(d.date), value: d.net }))} /> : <Empty>No lines this month.</Empty>}
      </Section>

      <Section title="Sale payments by stage and bank" hint="From the sales tab of the month: each reservation, additional, full payment and financing payout, with the bank written on the sale.">
        {s.sales.length ? <StackedBars label="Sale payments by stage and bank" series={s.salesBanks.map((name) => ({ name }))} categories={s.sales.map((x) => ({ label: STAGE_LABEL[x.stage], parts: s.salesBanks.map((b) => x.byBank[b] ?? 0) }))} /> : <Empty>No sale payments dated this month.</Empty>}
      </Section>

      <Section title="Needs a look" hint="Lines and payments the sheet leaves unfinished.">
        <div className="grid gap-4 md:grid-cols-2 text-sm">
          <div className="space-y-1"><p className="font-medium">{s.unlabelled} bank line{s.unlabelled === 1 ? "" : "s"} with no type</p>{unlabelled.map((l) => <p key={`${l.tab}${l.row}`} className="text-muted-foreground">{dayLabel(l.date)} · {l.account}{l.plate ? ` · ${l.plate}` : ""} · {peso((l.credit ?? 0) - (l.debit ?? 0))}</p>)}</div>
          <div className="space-y-1"><p className="font-medium">{s.paymentsWithoutAr} sale payment{s.paymentsWithoutAr === 1 ? "" : "s"} with no AR number</p>{noAr.map((p) => <p key={`${p.tab}${p.row}${p.stage}`} className="text-muted-foreground">{p.plate || "no plate"} · {STAGE_LABEL[p.stage]} · {p.bank || "no bank"} · {peso(p.amount)}</p>)}</div>
        </div>
      </Section>
    </div>
  );
}
