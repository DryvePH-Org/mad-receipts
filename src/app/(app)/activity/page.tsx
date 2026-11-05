import { Suspense } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth";
import { listActivity, type ActivityEntry } from "@/lib/data";
import { formatManilaDateTime } from "@/lib/dates";
import { formatPeso } from "@/lib/rules/money";
import { param } from "@/lib/search";
import { cn } from "@/lib/utils";

const TYPES: [string, string][] = [["", "Everything"], ["receipt.submit", "Receipts filled in"], ["receipt.approve", "Approved"], ["receipt.reject", "Rejected"], ["receipt.void", "Voided"], ["deal.cancel", "Cancelled deals and refunds"], ["deal.loan", "Loan released"], ["settings", "Settings"], ["user", "People"]];

export default function ActivityPage({ searchParams }: PageProps<"/activity">) {
  return (
    <div className="space-y-6">
      <PageHeader title="Activity log" description="Every receipt, approval, rejection, void, cancellation, refund, loan release and settings change. Nothing here can be edited." />
      <Suspense fallback={<PageSkeleton />}><Content searchParams={searchParams} /></Suspense>
    </div>
  );
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const peso = (v: unknown) => formatPeso(Math.round(Number(v ?? 0) * 100));

function describe(e: ActivityEntry): string {
  const a = obj(e.after), r = obj(a.receipt);
  switch (e.action) {
    case "receipt.submit": return `Filled in receipt ${r.receipt_no} for deal ${a.deal_no}: ${peso(r.amount)} received. Sent to the Approver.`;
    case "receipt.approve": return `Approved receipt ${r.receipt_no} (${peso(r.amount)}) on deal ${a.deal_no}.`;
    case "receipt.reject": return `Rejected receipt ${r.receipt_no} on deal ${a.deal_no}: ${a.reason}`;
    case "receipt.void": return `Voided receipt ${r.receipt_no} (${peso(r.amount)}): ${a.reason}`;
    case "deal.cancel": return `Cancelled deal ${a.deal_no}. Refunded ${peso(a.refund)}. ${a.reason}`;
    case "deal.loan": return a.status === "released" ? `Marked the ${a.institution} loan of deal ${a.deal_no} as released.` : `Marked the ${a.institution} loan of deal ${a.deal_no} as waiting again.`;
    case "settings.update": return "Changed the settings.";
    case "user.create": return `Created the account of ${obj(e.after).full_name}.`;
    case "user.role": return `Changed the role of ${obj(e.after).full_name} to ${obj(e.after).role}.`;
    case "user.reset_password": return "Reset a password.";
    case "sync.retry": return "Retried a sync job.";
    default: return e.action;
  }
}

async function Content({ searchParams }: { searchParams: PageProps<"/activity">["searchParams"] }) {
  await requireRole("admin", "approver");
  const type = param((await searchParams).type);
  const list = await listActivity(TYPES.some(([k]) => k === type) ? type : undefined);
  const dealId = (e: ActivityEntry) => (e.entity === "deal" ? e.entityId : obj(obj(e.after).receipt).deal_id);
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {TYPES.map(([k, label]) => <Button key={k} size="sm" variant={type === k ? "default" : "outline"} className={cn("rounded-full")} nativeButton={false} render={<Link href={k ? `/activity?type=${k}` : "/activity"} />}>{label}</Button>)}
      </div>
      <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
        <table className="w-full text-sm"><thead className="bg-muted/50 text-left text-xs tracking-wide text-muted-foreground uppercase"><tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Who</th><th className="px-4 py-2.5">What</th><th /></tr></thead><tbody>
          {list.map((e) => { const d = dealId(e); return <tr key={e.id} className="border-t"><td className="px-4 py-2.5 whitespace-nowrap">{formatManilaDateTime(e.at)}</td><td className="px-4 py-2.5 font-medium">{e.actor}</td><td className="px-4 py-2.5">{describe(e)}</td><td className="px-4 py-2.5 text-right">{typeof d === "string" && <Link href={`/deals/${d}`} className="text-sm underline">Open deal</Link>}</td></tr>; })}
          {list.length === 0 && <tr><td colSpan={4} className="p-10 text-center text-muted-foreground">Nothing here yet.</td></tr>}
        </tbody></table>
      </div>
    </>
  );
}
