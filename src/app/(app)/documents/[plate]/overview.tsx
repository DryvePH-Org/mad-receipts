import { SALE_FIELD_NAME } from "@/lib/sales/sections";
import Link from "next/link";
import { CircleAlert, CircleCheck } from "lucide-react";
import { Pill, type Tone } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CarFacts } from "@/lib/cars/car-file";
import { formatPeso } from "@/lib/rules/money";
import { PAYMENT_LABEL, type PaymentStatus } from "@/lib/docs/payments";
import { orLabel } from "@/lib/docsbible/or-expiry";
import { STAGE_LABEL, type Transfer } from "@/lib/transfers/model";
import { stepsOf } from "@/lib/transfers/steps";
import { carHref, type CarTab } from "./tabs";
import type { CarViewData } from "./types";

const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00+08:00` : iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" });
const STATE_TONE: Record<string, Tone> = { Sold: "teal", Reserved: "purple", Onhand: "emerald", "For repair": "red", "Not for sale": "zinc" };

function Block({ title, plate, tab, link, children }: { title: string; plate: string; tab: CarTab; link?: string; children: React.ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader><CardTitle className="flex items-center justify-between gap-3 text-sm">{title}<Link href={carHref(plate, tab)} className="text-xs font-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">{link ?? "Open"}</Link></CardTitle></CardHeader>
      <CardContent className="space-y-1.5 text-sm">{children}</CardContent>
    </Card>
  );
}
const Line = ({ k, v }: { k: string; v: React.ReactNode }) => <p className="flex gap-2"><span className="w-28 shrink-0 text-muted-foreground">{k}</span><span className="min-w-0 break-words">{v}</span></p>;

/**
 * The first thing on the car's page: where this car stands, in a few lines each, with a way into the tab that has the rest.
 * Status, documents, the sale, the transfer of the originals, repairs, and what needs a person.
 */
export function Overview({ data, facts, sale, steps, approval, canSale, detailsMissing, carDescription, payments }: {
  data: CarViewData; facts: CarFacts; sale: Transfer | null; steps: Parameters<typeof stepsOf>[0] | null; approval: { at: string | null; by: string | null };
  canSale: boolean; detailsMissing: number; carDescription: string | null;
  /** the payment papers kept for the car: null for the roles that do not see money */
  payments: { count: number; total: number } | null;
}) {
  const before = data.items.filter((i) => i.stage === "available" && !i.optional), have = before.filter((i) => i.present).length;
  const soldPapers = data.items.filter((i) => i.stage === "sold"), soldHave = soldPapers.filter((i) => i.present).length;
  const state = facts.unit?.stockState ?? null;
  const openRepairs = facts.repairs.filter((r) => r.approval === "approved" && /IN PROGRESS|FOR REPAIR|OPEN|ONGOING/i.test(r.status ?? ""));
  const flaggedFiles = data.files.filter((f) => f.flags.length).length;
  const attention: string[] = [
    ...(data.pending ? [`${data.pending} photo${data.pending === 1 ? "" : "s"} still to scan`] : []),
    ...(flaggedFiles ? [`${flaggedFiles} file${flaggedFiles === 1 ? "" : "s"} with a warning to check`] : []),
    ...(data.match === "linked" && before.length - have > 0 ? [`${before.length - have} paper${before.length - have === 1 ? "" : "s"} missing before the sale`] : []),
    ...(state === "Sold" && data.match === "linked" && soldPapers.length && soldHave < soldPapers.length ? [`${soldPapers.length - soldHave} paper${soldPapers.length - soldHave === 1 ? "" : "s"} missing after the sale`] : []),
    ...(detailsMissing ? [`${detailsMissing} detail${detailsMissing === 1 ? "" : "s"} of the car not filled in`] : []),
    ...(data.orState.state === "overdue" || data.orState.state === "soon" ? [`The OR: ${orLabel(data.orState)}`] : []),
    ...(canSale && state === "Sold" && !sale ? ["Sold, but no sale is recorded for this car"] : []),
    ...(sale?.flags ?? []),
  ];
  const s = steps ? stepsOf(steps) : null;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Block title="Status" plate={data.plate} tab="details" link="Details">
          <p className="flex flex-wrap items-center gap-2">{state ? <Pill tone={STATE_TONE[state] ?? "zinc"}>{state}</Pill> : <Pill tone="zinc">No status</Pill>}
            {facts.unit?.inStock && <Pill tone="zinc">On the sale list</Pill>}{data.location === "sold" ? <Pill tone="teal">Folder in Sold units</Pill> : data.match === "linked" ? <Pill tone="grey">Folder in Available units</Pill> : <Pill tone="zinc">No folder yet</Pill>}</p>
          {facts.unit?.stateOn && <Line k={state === "Sold" ? "Sold on" : "Since"} v={`${day(facts.unit.stateOn)}${facts.unit.stateFor ? ` · ${facts.unit.stateFor}` : ""}`} />}
          {carDescription && <Line k="Car" v={carDescription} />}
          {facts.unit?.owner && <Line k="Registered owner" v={facts.unit.owner} />}
          {facts.unit?.chassisNo && <Line k="Chassis" v={facts.unit.chassisNo} />}
        </Block>

        <Block title="Documents" plate={data.plate} tab="documents">
          {data.match === "linked" ? <>
            <Line k="Before the sale" v={<>{have} of {before.length} papers in the folder{data.pending ? ` (${data.pending} still to scan)` : ""}</>} />
            {state === "Sold" && soldPapers.length > 0 && <Line k="After the sale" v={`${soldHave} of ${soldPapers.length} papers (the signed AR, the buyer's ID, the deed)`} />}
            <Line k="Approval" v={approval.at ? <span className="text-emerald-800 dark:text-emerald-300">Approved by {approval.by ?? "someone"} on {day(approval.at)}</span> : "Not approved yet"} />
          </> : <p className="text-muted-foreground">This car has no folder in Drive yet. Add its documents, or link its folder.</p>}
        </Block>

        {canSale ? (
          <Block title="Sale" plate={data.plate} tab="sale">
            {sale ? <>
              <Line k={SALE_FIELD_NAME.buyer} v={sale.buyer ?? <span className="text-muted-foreground">not recorded</span>} />
              <Line k={SALE_FIELD_NAME.agreedPrice} v={sale.agreedPrice ? formatPeso(Math.round(sale.agreedPrice * 100)) : <span className="text-muted-foreground">not recorded</span>} />
              <Line k={SALE_FIELD_NAME.soldOn} v={sale.soldOn ? day(sale.soldOn) : <span className="text-muted-foreground">not recorded</span>} />
              <Line k={SALE_FIELD_NAME.sales} v={sale.sales ?? <span className="text-muted-foreground">not recorded</span>} />
              {sale.dealId && <Line k="Deal" v={data.dealLinks ? <Link href={`/deals/${sale.dealId}`} className="underline underline-offset-2">{sale.dealNo ?? "open the deal"}</Link> : (sale.dealNo ?? "")} />}
            </> : <p className="text-muted-foreground">No sale is recorded for this car.</p>}
          </Block>
        ) : data.deal && (
          <Block title="Sale" plate={data.plate} tab="documents" link="Sold papers">
            <Line k="Buyer" v={data.deal.buyerName} /><Line k="Deal" v={data.dealLinks ? <Link href={`/deals/${data.deal.id}`} className="underline underline-offset-2">{data.deal.dealNo}</Link> : data.deal.dealNo} />
          </Block>
        )}

        {canSale && payments && (
          <Block title="Payments" plate={data.plate} tab="payments" link={sale ? "Papers" : "Add the sale"}>
            {sale ? <>
              <p className="flex flex-wrap items-center gap-2">{sale.paymentStatus ? <Pill tone={sale.paymentStatus === "unpaid" ? "red" : sale.paymentStatus === "partial" ? "amber" : sale.paymentStatus === "loan_released" ? "teal" : "emerald"}>{PAYMENT_LABEL[sale.paymentStatus as PaymentStatus]}</Pill> : <Pill tone="zinc">Payment status not set</Pill>}</p>
              <Line k="Papers" v={payments.count ? `${payments.count} payment ${payments.count === 1 ? "paper" : "papers"}${payments.total > 0 ? ` · ${formatPeso(Math.round(payments.total * 100))} written on them` : ""}` : <span className="text-muted-foreground">none added yet</span>} />
            </> : <p className="text-muted-foreground">No sale yet. Add the sale to track its payments.</p>}
          </Block>
        )}

        {canSale && (
          <Block title="Transfer of the originals" plate={data.plate} tab="sale">
            {sale && s ? <>
              <p className="flex flex-wrap items-center gap-2"><Pill tone={sale.stage === "delivered" ? "emerald" : sale.stage === "cancelled" ? "red" : "blue"}>{STAGE_LABEL[sale.stage]}</Pill>{s.next && <span className="text-xs text-muted-foreground">next: {s.steps.find((x) => x.key === s.next)?.label.toLowerCase()}</span>}</p>
              <ol className="flex flex-wrap gap-1" aria-label="Steps">{s.steps.map((x) => <li key={x.key} className={`rounded-full px-2 py-0.5 text-[11px] ${x.done ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200" : "bg-muted text-muted-foreground"}`}>{x.label}</li>)}</ol>
              {sale.originalsAt && <Line k="Originals" v={sale.originalsAt} />}{sale.liaison && <Line k="Liaison" v={sale.liaison} />}
            </> : <p className="text-muted-foreground">Nothing to transfer yet.</p>}
          </Block>
        )}

        <Block title="Repairs" plate={data.plate} tab="details" link="Details">
          {openRepairs.length ? <ul className="space-y-1">{openRepairs.map((r) => <li key={r.id}>{r.problem ?? "A repair"} <Pill tone="amber">{r.status}</Pill>{r.dueOn && <span className="text-xs text-muted-foreground"> · due {day(r.dueOn)}</span>}</li>)}</ul>
            : <p className="text-muted-foreground">{facts.repairs.length ? `${facts.repairs.length} past repair${facts.repairs.length === 1 ? "" : "s"}, none open.` : "No repairs."}</p>}
        </Block>

        <Card size="sm" className={attention.length ? "ring-amber-300/60" : ""}>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm">{attention.length ? <CircleAlert className="size-4 text-amber-600" aria-hidden /> : <CircleCheck className="size-4 text-emerald-600" aria-hidden />}Needs a person</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {attention.length ? <ul className="list-disc space-y-1 pl-5">{attention.map((a) => <li key={a}>{a}</li>)}</ul> : <p className="text-muted-foreground">Nothing needs attention on this car.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
