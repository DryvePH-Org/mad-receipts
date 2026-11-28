import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { selectAll } from "@/lib/supabase/select-all";
import { saleMoney, type SaleInput, type SaleMoney } from "./money";

/** The sales that have payments from the sheet, as money (read with the server's own key: the pages that call it check the person's module). Empty before migration 79. */
export async function loadSales(balanceDays: number): Promise<SaleMoney[]> {
  const db = createAdminClient() as unknown as SupabaseClient;
  type Q = PromiseLike<{ data: never[] | null; error: { message: string } | null }>;
  let pays: Record<string, unknown>[];
  try { pays = await selectAll<Record<string, unknown>>((from, to) => db.from("car_sale_payments").select("sale_id, stage, amount, paid_on, bank, ar_no").order("id").range(from, to) as unknown as Q); }
  catch { return []; }
  const byId = new Map<string, SaleInput["payments"]>();
  for (const p of pays) byId.set(String(p.sale_id), [...(byId.get(String(p.sale_id)) ?? []), { stage: String(p.stage), amount: Number(p.amount), paidOn: (p.paid_on as string | null) ?? null, bank: (p.bank as string | null) ?? null, arNo: (p.ar_no as string | null) ?? null }]);
  const ids = [...byId.keys()];
  const sales: Record<string, unknown>[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await db.from("car_sales").select("id, plate_no, car_text, buyer, sales, financing, agreed_price, sold_on, stage").in("id", ids.slice(i, i + 100));
    sales.push(...(data ?? []));
  }
  return sales.map((s) => saleMoney({ id: String(s.id), plate: String(s.plate_no), carText: (s.car_text as string | null) ?? null, buyer: (s.buyer as string | null) ?? null, sales: (s.sales as string | null) ?? null, financing: (s.financing as string | null) ?? null, agreedPrice: s.agreed_price === null ? null : Number(s.agreed_price), soldOn: (s.sold_on as string | null) ?? null, stage: (s.stage as string | null) ?? null, payments: byId.get(String(s.id)) ?? [] }, balanceDays));
}
