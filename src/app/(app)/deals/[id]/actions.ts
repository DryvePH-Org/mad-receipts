"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin, requireModule, requireRole } from "@/lib/auth";
import { totals } from "@/lib/deal/math";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Json } from "@/lib/supabase/database.types";
import { friendlyError } from "@/lib/deal/errors";
import { toCentavos, fromCentavos } from "@/lib/rules/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { loanReleased, transactionDeleted, voidedOrCancelled } from "@/lib/notify/events";
import { deleteTransaction } from "@/lib/deal/delete-server";
import { cancelSaleRecords } from "@/lib/sales/ensure";
import { processDueJobs } from "@/lib/sync/process";

export type AdminResult = { ok: true } | { ok: false; error: string };
const uuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

function syncSoon() {
  after(() => processDueJobs().catch((e) => console.error(`[sync] after admin action failed: ${e instanceof Error ? e.message : "unknown"}`)));
}

export async function voidReceipt(receiptId: string, reason: string): Promise<AdminResult> {
  const user = await requireAdmin();
  await requireModule("deals");
  if (!uuid(receiptId)) return { ok: false, error: "That receipt was not found." };
  const { error } = await createAdminClient().rpc("void_receipt", { p_actor: user.id, p_receipt_id: receiptId, p_reason: reason });
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidatePath("/", "layout"); // every screen that shows deals, receipts or balances
  syncSoon();
  after(() => voidedOrCancelled("void", user.id, { receiptId, reason }));
  return { ok: true };
}

export async function cancelDeal(dealId: string, reason: string, refundText: string): Promise<AdminResult> {
  const user = await requireAdmin();
  await requireModule("deals");
  if (!uuid(dealId)) return { ok: false, error: "That deal was not found." };
  const refund = refundText.trim() ? toCentavos(refundText) : 0;
  if (refund === null) return { ok: false, error: "The refund is not a valid amount." };
  const { error } = await createAdminClient().rpc("cancel_deal", { p_actor: user.id, p_deal_id: dealId, p_reason: reason, p_refund: Number(fromCentavos(refund)) });
  if (error) return { ok: false, error: friendlyError(error.message) };
  syncSoon();
  after(() => cancelSaleRecords(dealId).catch((e) => console.error(`[sales] cancel failed: ${e instanceof Error ? e.message : "unknown"}`)));
  after(() => voidedOrCancelled("cancel", user.id, { dealId, reason }));
  return { ok: true };
}

/** Admin only: deletes the transaction and what hangs on it (the receipts, proofs, the audit and AR copies in Drive). The deal number is typed to confirm. */
export async function deleteDeal(dealId: string, typedDealNo: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const user = await requireAdmin();
  await requireModule("deals");
  if (!uuid(dealId)) return { ok: false, error: "That deal was not found." };
  const r = await deleteTransaction(dealId, user.id, typedDealNo);
  if (!r.ok) return { ok: false, error: r.message };
  revalidatePath("/", "layout");
  after(() => transactionDeleted(user.id, { dealNo: r.summary.dealNo, buyer: r.summary.buyer, receipts: r.summary.receipts }));
  const s = r.summary;
  return { ok: true, message: `Deleted ${s.dealNo}: ${s.receipts} receipt${s.receipts === 1 ? "" : "s"}, ${s.storageRemoved} proof photo${s.storageRemoved === 1 ? "" : "s"}, ${s.driveTrashed} file${s.driveTrashed === 1 ? "" : "s"} in Drive.${s.warnings.length ? ` Not everything could be removed: ${s.warnings.join(" ")}` : ""}` };
}

export async function setLoanStatus(dealId: string, status: "waiting" | "released", on: string): Promise<AdminResult> {
  const user = await requireAdmin();
  await requireModule("deals");
  if (!uuid(dealId)) return { ok: false, error: "That deal was not found." };
  const { error } = await createAdminClient().rpc("set_loan_status", { p_actor: user.id, p_deal_id: dealId, p_status: status, p_on: status === "released" && /^\d{4}-\d{2}-\d{2}$/.test(on) ? on : undefined });
  if (error) return { ok: false, error: friendlyError(error.message) };
  syncSoon();
  if (status === "released") after(() => loanReleased(dealId));
  return { ok: true };
}

const clean = (v: string | undefined) => (v ?? "").trim().replace(/\s+/g, " ");
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Super Admin only: corrects a saved transaction (the buyer, the price, the financing, the due date). The money is worked out again with the same rules
 * as a new receipt, every saved receipt's balance is re-counted, the printed copy of the receipts and the car's sale record follow, and the
 * change is written to the audit log with what it was before. A payment is changed with editReceipt.
 */
export async function editDeal(dealId: string, v: Record<string, string>): Promise<AdminResult> {
  const user = await requireRole("super_admin");
  await requireModule("deals");
  if (!uuid(dealId)) return { ok: false, error: "That deal was not found." };
  const db = createAdminClient();
  const { data: deal } = await db.from("deals").select("*").eq("id", dealId).maybeSingle();
  if (!deal) return { ok: false, error: "That deal was not found." };
  if (deal.status === "cancelled") return { ok: false, error: "A cancelled transaction cannot be changed." };
  const name = clean(v.buyer), address = clean(v.address), contact = clean(v.contact);
  if (!name) return { ok: false, error: "The buyer's name is required." };
  const price = toCentavos(v.price ?? ""), dp = clean(v.dp) ? toCentavos(v.dp) : 0, fee = clean(v.fee) ? toCentavos(v.fee) : 0;
  if (!price || price <= 0) return { ok: false, error: "The agreed price is not a valid amount." };
  if (dp === null || fee === null) return { ok: false, error: "The down payment or the fee is not a valid amount." };
  const financing = deal.sale_type === "financing";
  const institution = financing ? clean(v.institution) : null;
  if (financing && !institution) return { ok: false, error: "The financing institution is required." };
  const dueDate = clean(v.due);
  if (dueDate && !isDay(dueDate)) return { ok: false, error: "The due date is not a valid date." };

  const peso = (c: number) => Number(fromCentavos(c));
  const cents = (n: unknown) => Math.round(Number(n ?? 0) * 100);
  const t = totals({ price, sale: financing ? "financing" : "cash", dp: financing ? dp : 0, fee: financing && dp ? fee : 0, tradeIn: cents(deal.trade_in_value), earlier: 0, today: 0, payout: 0, lieu: cents(deal.lieu_amount), monthly: 0, years: 0 }); // all in centavos
  const { data: rs } = await db.from("receipts").select("id, snapshot, status, amount, payout, created_at").eq("deal_id", dealId).order("created_at").order("id");
  const live = (rs ?? []).filter((r) => r.status === "approved");
  let paid = cents(deal.opening_paid), out = 0;
  const after = new Map<string, number>();
  for (const r of live) { paid += cents(r.amount); out += cents(r.payout); after.set(r.id, peso(t.due - paid + out)); }
  const balance = t.due - paid + out;
  if (t.due >= 0 && balance < 0) return { ok: false, error: `Those figures leave the deal overpaid by ${peso(Math.abs(balance)).toLocaleString("en-PH")}: the receipts add up to more than the buyer owes. Fix the payments first.` };

  const loan = financing ? t.loan : 0;
  const patch: Record<string, unknown> = {
    buyer_name: name, buyer_address: address || null, buyer_contact: contact || null, agreed_price: peso(price), institution,
    down_payment: financing && dp ? peso(dp) : null, processing_fee: financing ? peso(fee) : 0, amount_due: peso(t.due), loan_amount: peso(loan),
    due_date: dueDate || null, updated_at: new Date().toISOString(),
  };
  if (financing) { if (loan > 0 && deal.loan_status === "none") { patch.loan_status = "waiting"; patch.loan_since = new Date().toISOString().slice(0, 10); } if (loan <= 0 && deal.loan_status === "waiting") patch.loan_status = "none"; }
  const same = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "");
  const changed = Object.keys(patch).filter((k) => k !== "updated_at" && !same(patch[k], (deal as Record<string, unknown>)[k]));
  const fmt = (c: number) => (c / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const u1 = await db.from("deals").update({ ...patch, terms: { ...((deal.terms as object) ?? {}), receivedFrom: name, address, contact, price: fmt(price), dp: financing && dp ? fmt(dp) : "", fee: financing && fee ? fmt(fee) : "", institution: institution ?? "", dueDate } }).eq("id", dealId);
  if (u1.error) return { ok: false, error: friendlyError(u1.error.message) };
  for (const r of rs ?? []) {
    const snap = { ...((r.snapshot as object) ?? {}), receivedFrom: name, address, contact, price: fmt(price), dp: financing && dp ? fmt(dp) : "", fee: financing && fee ? fmt(fee) : "", institution: institution ?? "", dueDate };
    const u = await db.from("receipts").update({ snapshot: snap, ...(after.has(r.id) ? { balance_after: after.get(r.id) } : {}) }).eq("id", r.id);
    if (u.error) return { ok: false, error: friendlyError(u.error.message) };
  }
  await (db as unknown as SupabaseClient).from("car_sales").update({ buyer: name.toUpperCase(), address: address ? address.toUpperCase() : null, contact: contact || null, agreed_price: peso(price), financing: institution ? institution.toUpperCase() : null, updated_by: user.id }).eq("deal_id", dealId);
  await db.from("audit_logs").insert({ actor_id: user.id, action: "deal.edit", entity: "deal", entity_id: dealId, before: Object.fromEntries(changed.map((k) => [k, (deal as Record<string, unknown>)[k]])) as Json, after: Object.fromEntries(changed.map((k) => [k, patch[k]])) as Json });
  revalidatePath("/", "layout");
  syncSoon();
  return { ok: true };
}

/** Super Admin only: corrects one saved receipt (its number, its date and the amount of each payment). The balances of the deal are re-counted. */
export async function editReceipt(receiptId: string, v: Record<string, string>): Promise<AdminResult> {
  const user = await requireRole("super_admin");
  await requireModule("deals");
  if (!uuid(receiptId)) return { ok: false, error: "That receipt was not found." };
  const db = createAdminClient();
  const { data: rc } = await db.from("receipts").select("*").eq("id", receiptId).maybeSingle();
  if (!rc) return { ok: false, error: "That receipt was not found." };
  if (rc.status === "void") return { ok: false, error: "A voided receipt cannot be changed." };
  const { data: deal } = await db.from("deals").select("*").eq("id", rc.deal_id).maybeSingle();
  if (!deal || deal.status === "cancelled") return { ok: false, error: "That transaction is cancelled and cannot be changed." };
  const no = clean(v.no), date = clean(v.date);
  if (!no) return { ok: false, error: "The receipt number is required." };
  if (!isDay(date)) return { ok: false, error: "The receipt date is not a valid date." };
  const { data: pays } = await db.from("receipt_payments").select("id, amount, label, position").eq("receipt_id", receiptId).order("position");
  const amounts = (pays ?? []).map((p) => ({ id: p.id, was: Number(p.amount), now: toCentavos(v[`p_${p.id}`] ?? "") }));
  if (amounts.some((a) => a.now === null || a.now < 0)) return { ok: false, error: "A payment is not a valid amount." };
  const total = amounts.reduce((n, a) => n + (a.now as number) / 100, 0);
  if (!total && !Number(rc.payout)) return { ok: false, error: "A receipt needs a payment." };
  const { data: rs } = await db.from("receipts").select("id, amount, payout, status").eq("deal_id", rc.deal_id).order("created_at").order("id");
  let paid = Number(deal.opening_paid ?? 0), out = 0;
  const after = new Map<string, number>();
  for (const r of (rs ?? []).filter((x) => x.status === "approved")) { paid += r.id === rc.id ? total : Number(r.amount); out += Number(r.payout ?? 0); after.set(r.id, Number(deal.amount_due) - paid + out); }
  const balance = Number(deal.amount_due) - paid + out;
  if (Number(deal.amount_due) >= 0 && balance < 0) return { ok: false, error: "That amount would leave the deal overpaid." };
  const u0 = await db.from("receipts").update({ receipt_no: no, receipt_date: date, amount: total }).eq("id", rc.id);
  if (u0.error) return { ok: false, error: friendlyError(u0.error.message) };
  for (const a of amounts) if (a.now !== a.was * 100) await db.from("receipt_payments").update({ amount: (a.now as number) / 100 }).eq("id", a.id);
  for (const [id, b] of after) await db.from("receipts").update({ balance_after: b }).eq("id", id);
  const snap = { ...((rc.snapshot as Record<string, unknown>) ?? {}), receiptNo: no, date };
  await db.from("receipts").update({ snapshot: snap }).eq("id", rc.id);
  const first = (rs ?? [])[0]?.id === rc.id;
  if (first) await db.from("deals").update({ deal_no: no }).eq("id", deal.id);
  await db.from("audit_logs").insert({ actor_id: user.id, action: "receipt.edit", entity: "receipt", entity_id: rc.id, before: { receipt_no: rc.receipt_no, receipt_date: rc.receipt_date, amount: rc.amount, payments: amounts.map((a) => a.was) }, after: { receipt_no: no, receipt_date: date, amount: total, payments: amounts.map((a) => (a.now as number) / 100) } });
  revalidatePath("/", "layout");
  syncSoon();
  return { ok: true };
}
