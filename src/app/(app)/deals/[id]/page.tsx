import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Camera } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { PhotoViewer } from "@/components/photo-viewer";
import { DueBadge } from "@/components/shared/due-badge";
import { MoneyText } from "@/components/shared/money-text";
import { PageSkeleton } from "@/components/shared/page-skeleton";
import { DealStatusBadge, Pill, ReceiptStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { formatDate, formatManilaDateTime, manilaToday } from "@/lib/dates";
import { paymentTypeLabel, pesos } from "@/lib/deals";
import { createClient } from "@/lib/supabase/server";
import { CancelDealDialog, EditDealDialog, VoidReceiptDialog } from "./admin-actions";

export default function DealPage({ params }: PageProps<"/deals/[id]">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageSkeleton />}>
        <DealContent params={params} />
      </Suspense>
    </div>
  );
}

const Detail = ({ label, value }: { label: string; value: string | null | undefined }) =>
  value ? (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{value}</dd>
    </div>
  ) : null;

async function DealContent({ params }: { params: PageProps<"/deals/[id]">["params"] }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const supabase = await createClient();

  const [dealResult, receiptsResult, peopleResult, optionsResult] = await Promise.all([
    supabase.from("deal_summaries").select("*").eq("id", id).maybeSingle(),
    supabase.from("receipts").select("*").eq("deal_id", id).order("created_at", { ascending: false }),
    supabase.from("deal_salespeople").select("salesperson_id, commission_percent, salespeople(name)").eq("deal_id", id),
    isAdmin ? supabase.from("salespeople").select("id, name").eq("active", true).order("name") : null,
  ]);
  const deal = dealResult.data;
  if (dealResult.error || receiptsResult.error) return <p className="text-destructive">Could not load this deal. Please try again.</p>;
  if (!deal || !deal.id) notFound();

  const receipts = receiptsResult.data;
  const people = (peopleResult.data ?? [])
    .map((p) => ({ salespersonId: p.salesperson_id, name: p.salespeople?.name ?? "", percent: Number(p.commission_percent) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Photos open full size through short-lived signed links.
  const paths = receipts.flatMap((r) => (r.photo_path ? [r.photo_path] : []));
  const signed = paths.length ? await supabase.storage.from("receipt-photos").createSignedUrls(paths, 60 * 60) : null;
  const photoUrl = new Map((signed?.data ?? []).flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])));

  const today = manilaToday();
  const confirmed = receipts.filter((r) => r.status === "confirmed");
  const latestId = confirmed[0]?.id; // receipts are newest first
  const canVoid = isAdmin && deal.status !== "cancelled" && confirmed.length > 1;
  const names = new Map(people.map((p) => [p.salespersonId, p.name]));
  for (const o of optionsResult?.data ?? []) names.set(o.id, o.name);

  const stateNote =
    deal.status === "open"
      ? "This car is reserved. The balance is still to be paid."
      : deal.status === "completed"
        ? "This car is sold. To correct a payment, void the latest receipt."
        : "This deal is cancelled. Its receipts stay on record.";

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {deal.plate_no}
            <DealStatusBadge status={deal.status} />
          </span>
        }
        description={[deal.buyer_name, deal.make_type].filter(Boolean).join(" · ")}
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/deals" />}>
            <ArrowLeft /> All deals
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Agreed price</dt>
                  <dd className="text-base font-semibold sm:text-lg"><MoneyText value={deal.agreed_price} /></dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Paid</dt>
                  <dd className="text-base font-semibold sm:text-lg"><MoneyText value={deal.total_paid} /></dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Balance</dt>
                  <dd className="text-base font-semibold sm:text-lg"><MoneyText value={deal.balance} /></dd>
                </div>
              </dl>
              {deal.next_due_date && (
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Next payment due {formatDate(deal.next_due_date)}</span>
                  <DueBadge dueDate={deal.next_due_date} today={today} />
                </p>
              )}
              {deal.status === "cancelled" && (
                <p className="rounded-lg bg-muted p-3 text-sm">
                  <span className="font-medium">Cancelled</span>
                  {deal.cancel_reason && `: ${deal.cancel_reason}`}
                  <span className="block text-muted-foreground">{deal.forfeited ? "The money was forfeited." : "The money was not forfeited."}</span>
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Receipts ({receipts.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="divide-y">
                {receipts.map((r) => {
                  const url = r.photo_path ? photoUrl.get(r.photo_path) : undefined;
                  const voided = r.status === "voided";
                  return (
                    <li key={r.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                      {url ? <PhotoViewer url={url} thumbnail /> : <div className="size-20 shrink-0 rounded-md border bg-muted" />}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={voided ? "font-semibold line-through" : "font-semibold"}>No. {r.receipt_no}</p>
                          {voided ? <ReceiptStatusBadge status={r.status} /> : <Pill tone="grey">{paymentTypeLabel(r.payment_type)}</Pill>}
                        </div>
                        <p className="text-sm">
                          <span className="font-medium"><MoneyText value={r.amount} /></span>
                          {r.receipt_date && <span className="text-muted-foreground"> · {formatDate(r.receipt_date)}</span>}
                          {r.payment_method && <span className="text-muted-foreground"> · {r.payment_method === "cash" ? "Cash" : "Check"}</span>}
                        </p>
                        <p className="text-sm text-muted-foreground">Balance after: {pesos(r.balance_after)}</p>
                        {voided && r.void_reason && <p className="text-sm text-destructive">Voided: {r.void_reason}</p>}
                        {canVoid && r.id === latestId && <div className="pt-1"><VoidReceiptDialog receiptId={r.id} receiptNo={r.receipt_no} /></div>}
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="pt-4 text-xs text-muted-foreground">
                Deal opened {formatManilaDateTime(deal.created_at ?? receipts.at(-1)?.created_at ?? new Date().toISOString())} (Manila time).
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Buyer and vehicle</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
                <Detail label="Buyer" value={deal.buyer_name} />
                <Detail label="Contact" value={deal.buyer_contact} />
                <Detail label="Address" value={deal.buyer_address} />
                <Detail label="Vehicle" value={deal.make_type} />
                <Detail label="Color" value={deal.color} />
                <Detail label="Motor No." value={deal.motor_no} />
                <Detail label="Chassis No." value={deal.chassis_no} />
              </dl>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{stateNote}</p>
              {deal.status === "open" && (
                <Button className="w-full" nativeButton={false} render={<Link href="/upload" />}>
                  <Camera /> Add a payment
                </Button>
              )}
              {isAdmin && (
                <>
                  <EditDealDialog
                    deal={{
                      id: deal.id,
                      buyer_name: deal.buyer_name ?? "",
                      buyer_address: deal.buyer_address ?? "",
                      buyer_contact: deal.buyer_contact ?? "",
                      make_type: deal.make_type ?? "",
                      color: deal.color ?? "",
                      motor_no: deal.motor_no ?? "",
                      chassis_no: deal.chassis_no ?? "",
                      completed: deal.status === "completed",
                    }}
                    salespeople={people.map((p) => ({ salespersonId: p.salespersonId, percent: p.percent }))}
                    options={optionsResult?.data ?? []}
                    names={[...names]}
                  />
                  {deal.status === "open" && <CancelDealDialog dealId={deal.id} plate={deal.plate_no ?? ""} paid={pesos(deal.total_paid)} />}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sold by</CardTitle>
            </CardHeader>
            <CardContent>
              {people.length === 0 ? (
                <p className="text-sm text-muted-foreground">No salesperson recorded yet. One is needed before the car is sold.</p>
              ) : (
                <ul className="-my-2 divide-y">
                  {people.map((p) => (
                    <li key={p.salespersonId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0 truncate font-medium">{p.name}</span>
                      <span className="shrink-0 tabular-nums">{Number(p.percent.toFixed(2))}% commission</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
