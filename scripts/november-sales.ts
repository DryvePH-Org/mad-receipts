// The November sales: compares the SALES MONITORING NOVEMBER tab (as MAD copied it) with the ARs typed by hand in New receipt, and removes the typed deals
// the sheet now covers. The sale records and their payments are made from the sheet by the app itself (Dashboard > Payments > "Copy from the sheet now").
//   npx jiti scripts/november-sales.ts                 report only (changes nothing)
//   npx jiti scripts/november-sales.ts --delete        removes the hand-typed deals whose every AR is on the sheet AND whose sale record is already made from the sheet
// A deal is removed with its receipts and proof photos. The car's status, the car's folder and the files in Google Drive are NOT touched.
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { planSales } from "../src/lib/payments/sales-plan";
import type { SalePayment } from "../src/lib/payments/parse";

const apply = process.argv.includes("--delete");
const TAB = process.argv.includes("--tab") ? process.argv[process.argv.indexOf("--tab") + 1] : "SALES MONITORING NOVEMBER 2026";
const env: Record<string, string | undefined> = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const norm = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const peso = (n: number) => `₱${n.toLocaleString("en-PH")}`;

async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let o = 0; ; o += 1000) { const { data, error } = await q(o, o + 999); if (error) throw new Error(error.message); out.push(...(data ?? [])); if ((data ?? []).length < 1000) return out; }
}

async function main() {
  const rows = await all<Record<string, unknown>>((a, b) => db.from("sheet_sale_payments").select("*").eq("tab", TAB).order("row_no").range(a, b));
  const pays: SalePayment[] = rows.map((r) => ({ tab: String(r.tab), row: Number(r.row_no), stage: r.stage as SalePayment["stage"], buyer: String(r.buyer ?? ""), plate: String(r.plate_no ?? ""), saleType: String(r.sale_type ?? ""), agreedPrice: r.agreed_price === null ? null : Number(r.agreed_price), bank: String(r.bank ?? ""), date: (r.pay_date as string | null) ?? null, amount: Number(r.amount), arNo: String(r.ar_no ?? "") }));
  const plates = [...new Set(pays.map((p) => p.plate))];
  const sales = await all<Record<string, unknown>>((a, b) => db.from("car_sales").select("id, plate_no, buyer, source, source_key, stage, deal_id").in("plate_no", plates).range(a, b));
  const plans = planSales(pays, sales.map((s) => ({ id: s.id as string, plate: s.plate_no as string, buyer: (s.buyer as string | null) ?? null, sourceKey: (s.source_key as string | null) ?? null, stage: (s.stage as string | null) ?? null })));
  console.log(`\n${TAB}: ${pays.length} payment lines, ${plans.length} sales`);
  console.log(`  would create ${plans.filter((p) => p.action === "create").length}, update ${plans.filter((p) => p.action === "update").length}, skip ${plans.filter((p) => p.action === "skip").length}`);
  for (const p of plans.filter((x) => x.action === "skip")) console.log(`  SKIP ${p.plate}: ${p.reason}`);
  for (const p of plans.filter((x) => x.arMissing)) console.log(`  ${p.plate} ${p.buyer}: ${p.arMissing} payment(s) with no AR number`);

  const deals = await all<Record<string, unknown>>((a, b) => db.from("deals").select("id, deal_no, buyer_name, agreed_price, status, deal_units(plate_no), receipts(id, receipt_no, amount, status)").gte("created_at", "2026-11-01").range(a, b));
  const byAr = new Map(pays.filter((p) => p.arNo).map((p) => [norm(p.arNo), p]));
  const removable: string[] = [];
  console.log(`\nHand-typed deals since 1 Nov: ${deals.length}`);
  for (const d of deals) {
    const plate = norm((d.deal_units as { plate_no: string }[])[0]?.plate_no);
    const rs = (d.receipts as { receipt_no: string; amount: number; status: string }[]).filter((r) => r.status !== "void" && r.status !== "voided");
    const problems: string[] = [];
    for (const r of rs) {
      const s = byAr.get(norm(r.receipt_no));
      if (!s) problems.push(`AR ${r.receipt_no} (${peso(Number(r.amount))}) is not on the sheet`);
      else if (Math.abs(s.amount - Number(r.amount)) > 0.5) problems.push(`AR ${r.receipt_no}: typed ${peso(Number(r.amount))}, sheet ${peso(s.amount)}`);
    }
    const made = sales.some((s) => norm(s.plate_no) === plate && s.source === "sheet");
    if (!made) problems.push("its sale record is not made from the sheet yet");
    console.log(`  ${d.deal_no} ${plate} ${d.buyer_name}: ${problems.length ? "KEEP — " + problems.join("; ") : "covered by the sheet"}`);
    if (!problems.length) removable.push(d.id as string);
  }
  console.log(`\n${removable.length} deal(s) can be removed${apply ? "" : " (run with --delete to remove them)"}`);
  if (!apply) return;
  for (const id of removable) {
    const { data: rec } = await db.from("receipts").select("id").eq("deal_id", id);
    const ids = (rec ?? []).map((r) => r.id as string);
    if (ids.length) {
      const { data: att } = await db.from("attachments").select("storage_path").in("receipt_id", ids);
      const paths = (att ?? []).map((a) => a.storage_path as string).filter(Boolean);
      if (paths.length) await db.storage.from("payment-proofs").remove(paths);
      await db.from("sync_jobs").delete().in("receipt_id", ids);
      const r = await db.from("receipts").delete().eq("deal_id", id); if (r.error) { console.error("receipts:", r.error.message); continue; }
    }
    const d = await db.from("deals").delete().eq("id", id);
    console.log(d.error ? `  could not remove ${id}: ${d.error.message}` : `  removed ${id}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
