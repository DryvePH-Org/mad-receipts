import type { SupabaseClient } from "@supabase/supabase-js";
import { Pill } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STAGE_LABEL } from "@/lib/payments/parse";
import { createAdminClient } from "@/lib/supabase/admin";

const peso = (n: number) => `₱${n.toLocaleString("en-PH", { maximumFractionDigits: 2 })}`;
const day = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "no date");
const STATUS: Record<string, { label: string; tone: "emerald" | "amber" | "zinc" }> = { paid: { label: "Fully paid", tone: "emerald" }, loan_released: { label: "Loan released", tone: "emerald" }, partial: { label: "Partly paid", tone: "amber" }, unpaid: { label: "Unpaid", tone: "zinc" } };

/** The payments of the car's sale as the Sales Passbook sheet has them (the sheet is the source: fix a wrong line there; MAD copies it). Nothing is typed here. */
export async function SheetPaymentsCard({ plate }: { plate: string }) {
  const db = createAdminClient() as unknown as SupabaseClient;
  // the sale that has this plate's payments from the sheet (a record made earlier keeps its own source, so the payments are the sign)
  const { data: own } = await db.from("car_sale_payments").select("sale_id").eq("plate_no", plate).limit(1);
  const saleId = (own?.[0]?.sale_id as string | undefined) ?? null;
  if (!saleId) return null;
  const { data: sale } = await db.from("car_sales").select("id, buyer, agreed_price, payment_status").eq("id", saleId).maybeSingle();
  if (!sale) return null;
  const { data } = await db.from("car_sale_payments").select("id, stage, bank, paid_on, amount, ar_no").eq("sale_id", sale.id as string).order("paid_on", { nullsFirst: false });
  const rows = (data ?? []) as { id: string; stage: keyof typeof STAGE_LABEL; bank: string | null; paid_on: string | null; amount: number | string; ar_no: string | null }[];
  const paid = rows.reduce((n, r) => n + Number(r.amount), 0);
  const price = sale.agreed_price === null ? null : Number(sale.agreed_price);
  const st = STATUS[(sale.payment_status as string) ?? "unpaid"] ?? STATUS.unpaid;
  return (
    <Card id="sheet-payments">
      <CardHeader><CardTitle className="flex flex-wrap items-center gap-3">Payments from the sheet <Pill tone={st.tone}>{st.label}</Pill></CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">From the Sales Passbook sheet{sale.buyer ? <>, buyer <b className="text-foreground">{String(sale.buyer)}</b></> : null}. To change a line, change it in the sheet; MAD copies it again each day, or press Copy from the sheet now in Dashboard → Payments.</p>
        <div className="overflow-x-auto"><table className="w-full text-left">
          <thead className="text-xs text-muted-foreground"><tr><th className="py-1 pr-3 font-medium">Date</th><th className="pr-3 font-medium">For</th><th className="pr-3 font-medium">Bank</th><th className="pr-3 font-medium">AR</th><th className="text-right font-medium">Amount</th></tr></thead>
          <tbody className="divide-y">{rows.map((r) => <tr key={r.id}><td className="py-1.5 pr-3">{day(r.paid_on)}</td><td className="pr-3">{STAGE_LABEL[r.stage] ?? r.stage}</td><td className="pr-3">{r.bank || "—"}</td><td className="pr-3">{r.ar_no || "—"}</td><td className="text-right tabular-nums">{peso(Number(r.amount))}</td></tr>)}</tbody>
          <tfoot><tr className="border-t font-medium"><td colSpan={4} className="py-1.5">Paid so far{price !== null ? ` of ${peso(price)}` : ""}</td><td className="text-right tabular-nums">{peso(paid)}</td></tr>{price !== null && price - paid > 0.5 && <tr><td colSpan={4} className="py-1 text-muted-foreground">Balance</td><td className="text-right tabular-nums">{peso(price - paid)}</td></tr>}</tfoot>
        </table></div>
      </CardContent>
    </Card>
  );
}
