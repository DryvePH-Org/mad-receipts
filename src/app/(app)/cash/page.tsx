import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { ReceiptStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { receiptsOnDay, type ReceiptView } from "@/lib/data";
import { formatDate, manilaToday } from "@/lib/dates";
import { formatPeso } from "@/lib/rules/money";
import { param } from "@/lib/search";
import { PrintButton } from "./print-button";

export default function CashPage({ searchParams }: PageProps<"/cash">) {
  return (
    <div className="space-y-6">
      <PageHeader title="Daily cash report" description="What was collected on a day, by person and by how it was paid. Use it to match the cash and the proof photos." actions={<PrintButton />} />
      <Suspense fallback={<PageSkeleton />}><Content searchParams={searchParams} /></Suspense>
    </div>
  );
}

const kind = (label: string) => (label === "Cash" ? 0 : label === "Check" ? 1 : 2);
const sum = (rs: ReceiptView[], k: number) => rs.reduce((n, r) => n + r.payments.filter((p) => kind(p.label) === k).reduce((a, p) => a + p.amount, 0), 0);

async function Content({ searchParams }: { searchParams: PageProps<"/cash">["searchParams"] }) {
  await requireRole("admin", "approver");
  const sp = await searchParams;
  const raw = param(sp.day);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : manilaToday();
  const withPending = param(sp.pending) !== "no";
  const recs = (await receiptsOnDay(day)).filter((r) => r.status === "approved" || withPending);
  const people = [...new Set(recs.map((r) => r.submittedByName))];
  const proofOk = recs.reduce((n, r) => n + r.payments.filter((p) => p.proofs > 0).length, 0), proofAll = recs.reduce((n, r) => n + r.payments.length, 0);
  const stat = (label: string, value: string, sub: string, bad?: boolean) => <div className="rounded-xl p-3 ring-1 ring-foreground/10 sm:p-4"><p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase sm:text-xs">{label}</p><p className={`text-xl sm:text-2xl font-semibold tabular-nums ${bad ? "text-destructive" : ""}`}>{value}</p><p className="text-xs text-muted-foreground">{sub}</p></div>;
  return (
    <>
      <form className="flex flex-wrap items-end gap-3 print:hidden" method="get">
        <div className="space-y-1.5"><label htmlFor="day" className="text-sm font-medium">Day</label><input id="day" name="day" type="date" defaultValue={day} className="h-10 rounded-lg border border-input bg-transparent px-2.5 text-base md:h-8 md:text-sm" /></div>
        <input type="hidden" name="pending" value={withPending ? "yes" : "no"} />
        <Button type="submit" variant="outline">Show</Button>
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href={`/cash?day=${day}&pending=${withPending ? "no" : "yes"}`} />}>{withPending ? "Approved only" : "Include waiting"}</Button>
      </form>
      <p className="hidden text-sm print:block">{formatDate(day)}</p>
      {recs.length === 0 ? <p className="rounded-xl border p-10 text-center text-muted-foreground">No receipts on {formatDate(day)}. Try another day.</p> : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {stat("Cash to turn in", formatPeso(sum(recs, 0)), "physical cash only")}
            {stat("Checks", formatPeso(sum(recs, 1)), `${recs.filter((r) => r.payments.some((p) => kind(p.label) === 1)).length} receipts`)}
            {stat("E-wallet and bank", formatPeso(sum(recs, 2)), "GCash, Maya, transfers")}
            {stat("Proof files", `${proofOk} of ${proofAll}`, "payments with a proof attached", proofOk < proofAll)}
          </div>
          <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs tracking-wide text-muted-foreground uppercase"><tr><th className="px-4 py-2.5">Person</th><th className="px-4 py-2.5 text-right">Cash</th><th className="px-4 py-2.5 text-right">Check</th><th className="px-4 py-2.5 text-right">E-wallet / bank</th><th className="px-4 py-2.5 text-right">Total</th></tr></thead><tbody>
            {people.map((p) => { const l = recs.filter((r) => r.submittedByName === p); return <tr key={p} className="border-t"><td className="px-4 py-2.5"><b>{p}</b><p className="text-xs text-muted-foreground">{l.length} {l.length === 1 ? "receipt" : "receipts"}</p></td><td className="px-4 py-2.5 text-right tabular-nums">{formatPeso(sum(l, 0))}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatPeso(sum(l, 1))}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatPeso(sum(l, 2))}</td><td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatPeso(l.reduce((n, r) => n + r.amount, 0))}</td></tr>; })}
            <tr className="border-t bg-muted/40 font-semibold"><td className="px-4 py-2.5">Everyone</td><td className="px-4 py-2.5 text-right tabular-nums">{formatPeso(sum(recs, 0))}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatPeso(sum(recs, 1))}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatPeso(sum(recs, 2))}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatPeso(recs.reduce((n, r) => n + r.amount, 0))}</td></tr>
          </tbody></table></div>
          <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10"><table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs tracking-wide text-muted-foreground uppercase"><tr><th className="px-4 py-2.5">Receipt</th><th className="px-4 py-2.5">Buyer</th><th className="px-4 py-2.5">By</th><th className="px-4 py-2.5 text-right">Cash</th><th className="px-4 py-2.5 text-right">Check</th><th className="px-4 py-2.5 text-right">E-wallet / bank</th><th className="px-4 py-2.5 text-right">Total</th><th className="px-4 py-2.5">Status</th></tr></thead><tbody>
            {recs.map((r) => <tr key={r.id} className="border-t"><td className="px-4 py-2.5"><Link href={`/deals/${r.dealId}`} className="font-mono font-semibold hover:underline">{r.receiptNo}</Link></td><td className="px-4 py-2.5">{r.buyerName}</td><td className="px-4 py-2.5">{r.submittedByName}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatPeso(sum([r], 0))}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatPeso(sum([r], 1))}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatPeso(sum([r], 2))}</td><td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatPeso(r.amount)}</td><td className="px-4 py-2.5"><ReceiptStatusBadge status={r.status} /></td></tr>)}
          </tbody></table></div>
        </div>
      )}
    </>
  );
}
