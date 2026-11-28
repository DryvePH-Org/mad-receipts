import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAll } from "@/lib/supabase/select-all";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SalePayment } from "./parse";
import { manilaToday } from "@/lib/dates";
import { carStateFor, isRecentSale, planSales, type ExistingSale, type SalePlan } from "./sales-plan";

const db = (): SupabaseClient => createAdminClient() as unknown as SupabaseClient;
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export interface SalesImport { plans: SalePlan[]; created: number; updated: number; skipped: { plate: string; reason: string }[]; payments: number; carStates: { plate: string; from: string | null; to: string }[] }

/**
 * Makes the sale records of one SALES MONITORING tab (already copied into sheet_sale_payments) and their payments. The sheet is the source of truth:
 * the buyer, price, date, financing company and payment status follow it; the transfer fields of a record are never touched. With dryRun nothing is written.
 */
export async function importSheetSales(tab: string, dryRun = false): Promise<SalesImport> {
  const client = db();
  const rows = await selectAll<Record<string, unknown>>((from, to) => client.from("sheet_sale_payments").select("tab, row_no, stage, buyer, plate_no, sale_type, agreed_price, bank, pay_date, amount, ar_no").eq("tab", tab).order("row_no").range(from, to) as unknown as PromiseLike<{ data: never[] | null; error: { message: string } | null }>);
  const pays: SalePayment[] = rows.map((r) => ({ tab: String(r.tab), row: Number(r.row_no), stage: r.stage as SalePayment["stage"], buyer: String(r.buyer ?? ""), plate: String(r.plate_no ?? ""), saleType: String(r.sale_type ?? ""), agreedPrice: r.agreed_price === null ? null : Number(r.agreed_price), bank: String(r.bank ?? ""), date: (r.pay_date as string | null) ?? null, amount: Number(r.amount), arNo: String(r.ar_no ?? "") }));
  const plates = [...new Set(pays.map((p) => p.plate).filter(Boolean))];
  const existing: ExistingSale[] = [];
  for (const part of chunk(plates, 100)) {
    const { data } = await client.from("car_sales").select("id, plate_no, buyer, source_key, stage").in("plate_no", part);
    for (const r of data ?? []) existing.push({ id: r.id as string, plate: r.plate_no as string, buyer: (r.buyer as string | null) ?? null, sourceKey: (r.source_key as string | null) ?? null, stage: (r.stage as string | null) ?? null });
  }
  const plans = planSales(pays, existing);
  const out: SalesImport = { plans, created: 0, updated: 0, skipped: [], payments: 0, carStates: [] };
  const today = manilaToday();
  for (const p of plans) {
    if (p.action === "skip") { out.skipped.push({ plate: p.plate, reason: p.reason ?? "" }); continue; }
    const { data: unit } = await client.from("docs_units").select("id, year_model, make, model_variant, color, stock_state").eq("plate_no", p.plate).is("archived_at", null).order("arrival_date", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    // the car's status follows a recent sale on the sheet (paid in full: Sold; money in, balance left: Reserved)
    const lastPaid = p.payments.map((x) => x.date).filter((d): d is string => !!d).sort().pop() ?? p.soldOn;
    const to = unit && isRecentSale(lastPaid, today) ? carStateFor((unit.stock_state as string | null) ?? null, p.status) : null;
    if (unit && to) out.carStates.push({ plate: p.plate, from: (unit.stock_state as string | null) ?? null, to });
    if (dryRun) { if (p.action === "create") out.created++; else out.updated++; out.payments += p.payments.length; continue; }
    if (unit && to) await client.from("docs_units").update({ stock_state: to, last_change_source: "sheet" }).eq("id", unit.id as string).eq("stock_state", (unit.stock_state as string | null) ?? "");
    // what the sheet says follows it; what the sheet leaves empty is not erased in MAD
    const facts: Record<string, unknown> = { buyer: p.buyer, payment_status: p.status, payment_status_at: new Date().toISOString() };
    if (p.agreedPrice !== null) facts.agreed_price = p.agreedPrice;
    if (p.soldOn) facts.sold_on = p.soldOn;
    if (p.financing) facts.financing = p.financing;
    let saleId = p.saleId;
    if (p.action === "create") {
      const car = unit ? [unit.year_model, unit.make, unit.model_variant, unit.color].filter(Boolean).join(" ") : null;
      const { data, error } = await client.from("car_sales").insert({ plate_no: p.plate, unit_id: unit?.id ?? null, car_text: car, route: "unknown", stage: "in_process", source: "sheet", source_key: p.sourceKey, ...facts }).select("id").single();
      if (error || !data) throw new Error(`The sale of ${p.plate} could not be made: ${error?.message}`);
      saleId = data.id as string; out.created++;
    } else {
      // a record a deal made now belongs to the sheet, so removing the deal later does not remove the sale
      const { data: was } = await client.from("car_sales").select("source_key").eq("id", saleId!).maybeSingle();
      const key = (was?.source_key as string | null) ?? null;
      const detach = !key || key.startsWith("deal|") ? { source: "sheet", source_key: p.sourceKey, deal_id: null } : {};
      const { error } = await client.from("car_sales").update({ ...facts, ...detach }).eq("id", saleId!);
      if (error) throw new Error(`The sale of ${p.plate} could not be updated: ${error.message}`);
      out.updated++;
    }
    await client.from("car_sale_payments").delete().eq("sale_id", saleId!);
    const { error } = await client.from("car_sale_payments").insert(p.payments.map((x) => ({ sale_id: saleId, plate_no: x.plate, stage: x.stage, bank: x.bank || null, paid_on: x.date, amount: x.amount, ar_no: x.arNo || null, source_tab: x.tab, source_row: x.row })));
    if (error) throw new Error(`The payments of ${p.plate} could not be saved: ${error.message}`);
    out.payments += p.payments.length;
  }
  return out;
}
