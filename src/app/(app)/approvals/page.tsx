import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { ReceiptStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/lib/auth";
import { getDeal, pendingReceipts, recentlyDecided } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { KIND_LABELS } from "@/lib/deal/types";
import { formatPeso } from "@/lib/rules/money";
import { ShieldCheck } from "lucide-react";
import { ReviewButtons } from "./review-buttons";

export default function ApprovalsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Approvals" description="Every receipt needs the Approver before it goes to Drive, Sheets, the inventory sheet and Telegram." />
      <Suspense fallback={<PageSkeleton />}><Content /></Suspense>
    </div>
  );
}

async function Content() {
  const user = await requireModule("approvals");
  // the Approver role, or anyone the Admin gave the Approvals module to, may approve; others can look
  const canReview = user.role === "approver" || user.grants.includes("approvals");
  const [pending, decided] = await Promise.all([pendingReceipts(), recentlyDecided()]);
  const deals = new Map((await Promise.all([...new Set(pending.map((r) => r.dealId))].map((id) => getDeal(id)))).flatMap((d) => (d ? [[d.id, d] as const] : [])));
  return (
    <div className="max-w-4xl space-y-4">
      {!canReview && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">You can look but not approve. Only the Approver, or someone the Admin gave Approvals to, approves.</p>}
      {pending.length === 0 ? <EmptyState icon={ShieldCheck} title="Nothing is waiting" description="Receipts filled in by Sales show up here." /> : pending.map((r) => {
        const d = deals.get(r.dealId);
        const afterThis = d ? d.due - d.openingPaid - d.approvedPaid - r.amount + d.approvedPayout + r.payout : 0;
        const own = r.submittedBy === user.id;
        return (
          <div key={r.id} className="space-y-3 rounded-xl p-4 ring-1 ring-foreground/10">
            <div className="flex items-start justify-between gap-4">
              <div><h3 className="font-medium">Receipt <span className="font-mono">{r.receiptNo}</span> · {KIND_LABELS[r.kind]} · {formatPeso(r.amount)}</h3>
                <p className="text-sm text-muted-foreground">{r.buyerName} · {d?.unitName} · <span className="font-mono">{d?.plates}</span></p></div>
              <div className="text-right"><ReceiptStatusBadge status={r.status} /><p className="mt-1 text-xs text-muted-foreground">filled in by {r.submittedByName} · {formatDate(r.submittedAt.slice(0, 10))}</p></div>
            </div>
            <div className="flex flex-wrap gap-1.5">{r.payments.map((p) => <span key={p.id} className="rounded-md bg-muted px-2 py-1 text-sm">{p.label} {formatPeso(p.amount)} <span className={p.proofs ? "text-emerald-700" : "text-destructive"}>· {p.proofs ? "proof ✓" : "no proof"}</span></span>)}{r.payout > 0 && <span className="rounded-md bg-muted px-2 py-1 text-sm">Payout {formatPeso(r.payout)} <span className={r.payoutProofs ? "text-emerald-700" : "text-destructive"}>· {r.payoutProofs ? "proof ✓" : "no proof"}</span></span>}</div>
            {d && <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm"><dt className="text-muted-foreground">Amount due from the buyer</dt><dd className="tabular-nums">{formatPeso(d.due)}</dd><dt className="text-muted-foreground">Already approved</dt><dd className="tabular-nums">{formatPeso(d.openingPaid + d.approvedPaid)}</dd><dt className="text-muted-foreground">Balance after this receipt</dt><dd className={`tabular-nums ${d.due >= 0 && afterThis < 0 ? "font-semibold text-destructive" : ""}`}>{d.due >= 0 && afterThis < 0 ? `Overpaid ${formatPeso(-afterThis)}` : formatPeso(afterThis)}</dd></dl>}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" nativeButton={false} render={<Link href={`/deals/${r.dealId}`} />}>Open deal</Button>
              {canReview ? (own ? <span className="text-sm text-muted-foreground">You filled this in, so someone else must approve it.</span> : <ReviewButtons receiptId={r.id} receiptNo={r.receiptNo} />) : null}
            </div>
          </div>
        );
      })}
      <h2 className="pt-4 font-medium">Recently decided</h2>
      <div className="overflow-hidden rounded-xl ring-1 ring-foreground/10"><table className="w-full text-sm"><tbody>
        {decided.map((r) => <tr key={r.id} className="border-t first:border-t-0"><td className="px-4 py-2.5"><b className="font-mono">{r.receiptNo}</b></td><td className="px-4 py-2.5">{r.buyerName}</td><td className="px-4 py-2.5 text-right tabular-nums">{formatPeso(r.amount)}</td><td className="px-4 py-2.5"><ReceiptStatusBadge status={r.status} /><p className="text-xs text-muted-foreground">{r.status === "rejected" ? r.rejectReason : `by ${r.reviewedByName ?? ""}`}</p></td></tr>)}
        {decided.length === 0 && <tr><td className="p-4 text-center text-muted-foreground">Nothing decided yet.</td></tr>}
      </tbody></table></div>
    </div>
  );
}
