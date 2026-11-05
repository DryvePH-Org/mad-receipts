import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { LedgerView } from "@/components/deal/ledger-view";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { DealStatusBadge, Pill, ReceiptStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getDeal, receiptsOfDeal } from "@/lib/data";
import { formatDate, manilaToday } from "@/lib/dates";
import { buildLedger, totals } from "@/lib/deal/math";
import { dealStatusKey, relativeDay } from "@/lib/deal/status";
import { KIND_LABELS } from "@/lib/deal/types";
import { formatPeso } from "@/lib/rules/money";
import { DealAdminActions, PrintReceiptButton } from "./deal-actions";

export default function DealPage({ params }: PageProps<"/deals/[id]">) {
  return <Suspense fallback={<PageSkeleton />}><Content params={params} /></Suspense>;
}

function Kv({ rows }: { rows: [string, React.ReactNode][] }) {
  return <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">{rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}</dl>;
}

async function Content({ params }: { params: PageProps<"/deals/[id]">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  const deal = await getDeal(id);
  if (!deal) notFound();
  const today = manilaToday();
  const receipts = await receiptsOfDeal(deal.id);
  const status = dealStatusKey({ status: deal.status, balance: deal.balance, due_date: deal.dueDate, sale_type: deal.saleType, loan_status: deal.loanStatus }, today);
  const t = totals({ price: deal.price, sale: deal.saleType, dp: deal.downPayment, fee: deal.fee, tradeIn: deal.tradeIn, earlier: deal.openingPaid + deal.approvedPaid, today: 0, payout: deal.approvedPayout, lieu: deal.lieu, monthly: deal.monthly, years: deal.years });
  const tradeText = [[deal.tradeInInfo?.year, deal.tradeInInfo?.unit].filter(Boolean).join(" "), deal.tradeInInfo?.plate].filter(Boolean).join(" · ");
  const ledger = buildLedger(t, { units: deal.units.length, institution: deal.institution ?? "", tradeInText: tradeText, payRows: [], payoutProofs: 0, lieuUntilText: deal.lieuUntil ? formatDate(deal.lieuUntil) : "" });
  const pct = t.due > 0 ? Math.max(0, Math.min(100, Math.round(((deal.openingPaid + deal.approvedPaid) / t.due) * 100))) : 100;
  const isAdmin = user.role === "admin";
  const invStatus = deal.status === "cancelled" ? "Available" : status === "settled" ? "Sold" : "Reserved";

  return (
    <div className="space-y-6">
      <PageHeader
        title={<>{deal.buyerName} <span className="font-normal text-muted-foreground">· {deal.unitName}</span></>}
        description={`Deal ${deal.dealNo} · ${deal.plates} · opened ${formatDate(deal.createdAt.slice(0, 10))} by ${deal.createdByName}`}
        actions={<>
          <Button variant="outline" nativeButton={false} render={<Link href="/deals" />}>All transactions</Button>
          {deal.status === "open" && deal.balance > 0 && <Button nativeButton={false} render={<Link href={`/new?deal=${deal.id}`} />}><Plus /> Add a payment</Button>}
        </>}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center justify-between gap-3">Where the money stands <DealStatusBadge status={status} /></CardTitle>
              <p className="text-sm text-muted-foreground">Only approved receipts are counted{deal.pendingPaid ? `. ${formatPeso(deal.pendingPaid)} is still waiting for approval.` : "."}</p></CardHeader>
            <CardContent className="space-y-4">
              <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
              <LedgerView ledger={ledger} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Receipts on this deal</CardTitle><p className="text-sm text-muted-foreground">{receipts.length} in all, in the order they were filled in.</p></CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs tracking-wide text-muted-foreground uppercase"><tr><th className="px-3 py-2">No.</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Paid through</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr></thead>
                  <tbody>
                    {receipts.map((r) => (
                      <tr key={r.id} className="border-t align-top">
                        <td className="px-3 py-2.5"><b className="font-mono">{r.receiptNo}</b><p className="text-xs text-muted-foreground">{KIND_LABELS[r.kind]}</p></td>
                        <td className="px-3 py-2.5">{formatDate(r.date)}<p className="text-xs text-muted-foreground">by {r.submittedByName}</p></td>
                        <td className="px-3 py-2.5">{r.payments.map((p) => <p key={p.id}>{p.label} {formatPeso(p.amount)}<span className="text-xs text-muted-foreground"> · {p.proofs} {p.proofs === 1 ? "proof" : "proofs"}</span></p>)}{r.payout > 0 && <p>Paid out {formatPeso(r.payout)}</p>}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatPeso(r.amount)}</td>
                        <td className="px-3 py-2.5"><ReceiptStatusBadge status={r.status} />{r.status === "rejected" && <p className="text-xs text-muted-foreground">{r.rejectReason}</p>}{r.status === "void" && <p className="text-xs text-muted-foreground">{r.voidReason}</p>}{r.status === "approved" && r.reviewedByName && <p className="text-xs text-muted-foreground">by {r.reviewedByName}</p>}</td>
                        <td className="px-3 py-2.5"><div className="flex justify-end gap-1.5"><PrintReceiptButton receiptId={r.id} />
                          {isAdmin && r.status === "approved" && <DealAdminActions mode="receipt" dealId={deal.id} today={today} loanStatus={deal.loanStatus} institution="" loanAmount="" canCancel={false} receiptId={r.id} receiptNo={r.receiptNo} amountText={formatPeso(r.amount)} />}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card size="sm">
            <CardHeader><CardTitle className="flex items-center justify-between">Status <DealStatusBadge status={status} /></CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Kv rows={[
                ["Balance", deal.status === "cancelled" ? "—" : formatPeso(Math.max(0, deal.balance))],
                ["Due", deal.balance > 0 && deal.status !== "cancelled" ? (deal.dueDate ? `${formatDate(deal.dueDate)} (${relativeDay(deal.dueDate, today)})` : (deal.dueText ?? "No date")) : "—"],
                ["Sale", deal.saleType === "financing" ? "Financing" : "Cash"], ["Salesperson", deal.createdByName],
              ]} />
              {deal.status === "cancelled" && <p className="text-sm text-muted-foreground">Cancelled {deal.cancelledAt ? formatDate(deal.cancelledAt.slice(0, 10)) : ""}: {deal.cancelReason} Refunded {formatPeso(deal.refund)}.</p>}
            </CardContent>
          </Card>

          {deal.saleType === "financing" && (
            <Card size="sm">
              <CardHeader><CardTitle>The lender · {deal.institution}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Kv rows={[["Loan", formatPeso(deal.loan)], ["Processing fee", formatPeso(deal.fee)], ["Loan status", deal.loanStatus === "released" ? <Pill key="l" tone="emerald">Released {deal.loanReleasedOn ? formatDate(deal.loanReleasedOn) : ""}</Pill> : <Pill key="l" tone="teal">Waiting{deal.loanSince ? ` since ${formatDate(deal.loanSince)}` : ""}</Pill>]]} />
                <p className="text-xs text-muted-foreground">The fee is owed by the buyer to the lender, not to us. The loan is paid to us by the lender and is not in the buyer&apos;s balance.</p>
                {isAdmin && deal.status === "open" ? <DealAdminActions mode="deal" dealId={deal.id} today={today} loanStatus={deal.loanStatus} institution={deal.institution ?? ""} loanAmount={formatPeso(deal.loan)} canCancel={false} carFreed={deal.balance <= 0} /> : deal.status === "open" && <p className="text-xs text-muted-foreground">Only the Admin can mark the loan as released.</p>}
              </CardContent>
            </Card>
          )}

          <Card size="sm">
            <CardHeader><CardTitle>Inventory sheet</CardTitle><p className="text-sm text-muted-foreground">What the REMARKS column shows</p></CardHeader>
            <CardContent className="space-y-2">
              {deal.units.map((u) => <div key={u.plate_no} className="flex items-center justify-between gap-3 text-sm"><span><b className="font-medium">{u.make_type}</b><br /><span className="font-mono text-xs text-muted-foreground">{u.plate}</span></span><Pill tone={invStatus === "Sold" ? "zinc" : invStatus === "Reserved" ? "amber" : "emerald"}>{invStatus}</Pill></div>)}
              <p className="text-xs text-muted-foreground">Reserved while anything is unpaid. It becomes Sold only when the buyer&apos;s part is paid{deal.saleType === "financing" ? " and the loan is released" : ""}. A cancelled deal frees the car again.</p>
            </CardContent>
          </Card>

          {deal.lieu > 0 && (
            <Card size="sm"><CardHeader><CardTitle>Documents held</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">We hold the buyer&apos;s documents as collateral for {formatPeso(deal.lieu)} until {deal.lieuUntil ? `${formatDate(deal.lieuUntil)} (${relativeDay(deal.lieuUntil, today)})` : "the date given"}. No money moved, so the balance is not affected.</CardContent></Card>
          )}

          {isAdmin && deal.status === "open" && <DealAdminActions mode="deal" dealId={deal.id} today={today} loanStatus="none" institution="" loanAmount="" canCancel />}
        </div>
      </div>
    </div>
  );
}
