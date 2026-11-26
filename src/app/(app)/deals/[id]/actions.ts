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

/** Counts the balance after each saved receipt again, in the order of the receipt dates. */
async function rechain(db: ReturnType<typeof createAdminClient>, dealId: string): Promise<void> {
  const { data: deal } = await db.from("deals").select("amount_due, opening_paid").eq("id", dealId).maybeSingle();
  if (!deal) return;
  const { data: rs } = await db.from("receipts").select("id, amount, payout, status").eq("deal_id", dealId).order("receipt_date").order("created_at").order("id");
  let paid = Math.round(Number(deal.opening_paid ?? 0) * 100), out = 0;
  for (const r of (rs ?? []).filter((x) => x.status === "approved")) {
    paid += Math.round(Number(r.amount) * 100); out += Math.round(Number(r.payout ?? 0) * 100);
    await db.from("receipts").update({ balance_after: (Math.round(Number(deal.amount_due) * 100) - paid + out) / 100 }).eq("id", r.id);
  }
}

const clean = (v: string | undefined) => (v ?? "").trim().replace(/\s+/g, " ");
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Super Admin only: corrects a saved transaction as a whole (the buyer, the cars, cash or financing, the price, the trade-in, what was paid before
 * the first receipt, the due date). The money is worked out again with the same rules as a new receipt, every saved receipt's balance is re-counted
 * (in the order of their dates), the printed copy of the receipts and the car's sale record follow, and the change is written to the audit log with
 * what it was before. A payment is changed with editReceipt.
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
  const money = (k: string) => (clean(v[k]) ? toCentavos(v[k]) : 0);
  const price = toCentavos(v.price ?? ""), dp = money("dp"), fee = money("fee"), tv = money("tv"), lieu = money("lieu"), earlier = money("earlier");
  if (!price || price <= 0) return { ok: false, error: "The agreed price is not a valid amount." };
  if ([dp, fee, tv, lieu, earlier].some((x) => x === null || x < 0)) return { ok: false, error: "One of the amounts (down payment, fee, trade-in, in lieu, paid before) is not valid." };
  const sale = /^fin/i.test(clean(v.sale)) ? "financing" : /^cash/i.test(clean(v.sale)) ? "cash" : null;
  if (!sale) return { ok: false, error: "Sale type must be cash or financing." };
  const financing = sale === "financing";
  const institution = financing ? clean(v.institution) : null;
  if (financing && !institution) return { ok: false, error: "The financing institution is required." };
  const years = clean(v.years).replace(/[^\d.]/g, "");
  const dueDate = clean(v.due), lieuUntil = clean(v.lieuUntil);
  if ((dueDate && !isDay(dueDate)) || (lieuUntil && !isDay(lieuUntil))) return { ok: false, error: "A date is not valid." };
  if (dueDate && clean(v.dueText)) return { ok: false, error: "Use either the due date or the due text, not both." };

  const peso = (c: number) => Number(fromCentavos(c));
  const cents = (n: unknown) => Math.round(Number(n ?? 0) * 100);
  const dpNum = financing ? (dp as number) : 0;
  const t = totals({ price, sale, dp: dpNum, fee: financing && dpNum ? (fee as number) : 0, tradeIn: tv as number, earlier: 0, today: 0, payout: 0, lieu: lieu as number, monthly: 0, years: 0 }); // all in centavos
  if (financing && t.tv > t.share) return { ok: false, error: "The trade-in is worth more than the down payment." };
  const { data: rs } = await db.from("receipts").select("id, snapshot, status, amount, payout, created_at, receipt_date").eq("deal_id", dealId).order("receipt_date").order("created_at").order("id");
  const live = (rs ?? []).filter((r) => r.status === "approved");
  let paid = earlier as number, out = 0;
  const after = new Map<string, number>();
  for (const r of live) { paid += cents(r.amount); out += cents(r.payout); after.set(r.id, peso(t.due - paid + out)); }
  const balance = t.due - paid + out;
  if (t.due >= 0 && balance < 0) return { ok: false, error: `Those figures leave the deal overpaid by ${peso(Math.abs(balance)).toLocaleString("en-PH")}: the receipts add up to more than the buyer owes. Fix the payments first.` };

  // the cars of the deal
  const { data: dus } = await db.from("deal_units").select("id, position, make_type, plate_no, plate_display, color").eq("deal_id", dealId).order("position");
  const unitPatches: { id: string; oldPlate: string; make: string; plate: string; display: string; color: string | null }[] = [];
  for (const [n, u] of (dus ?? []).entries()) {
    const make = clean(v[`u${n}_make`]) || u.make_type, display = clean(v[`u${n}_plate`]).toUpperCase() || u.plate_display, color = clean(v[`u${n}_color`]) || null;
    const plate = display.replace(/[^A-Z0-9]/g, "");
    if (!plate) return { ok: false, error: "A plate number is required." };
    unitPatches.push({ id: u.id, oldPlate: u.plate_no, make, plate, display, color });
  }
  for (const u of unitPatches.filter((x) => x.plate !== x.oldPlate)) {
    const { data: car } = await (db as unknown as SupabaseClient).from("docs_units_current").select("plate_no").eq("plate_no", u.plate).limit(1);
    if (!car?.length) return { ok: false, error: `${u.display} is not in the car list. Add the car first, or check the plate.` };
    const { data: clash } = await db.from("deal_units").select("id").eq("plate_no", u.plate).eq("active", true).neq("deal_id", dealId).limit(1);
    if (clash?.length) return { ok: false, error: `${u.display} already has another live transaction.` };
  }

  const loan = financing ? t.loan : 0;
  const patch: Record<string, unknown> = {
    buyer_name: name, buyer_address: address || null, buyer_contact: contact || null, sale_type: sale, institution, agreed_price: peso(price),
    down_payment: financing && dpNum ? peso(dpNum) : null, processing_fee: financing ? peso(fee as number) : 0, amount_due: peso(t.due), loan_amount: peso(loan),
    years: financing && years ? years : null, opening_paid: peso(earlier as number), trade_in_value: peso(tv as number),
    trade_in: (tv as number) > 0 ? { ...((deal.trade_in as object) ?? {}), unit: clean(v.tiUnit) } : null,
    lieu_amount: peso(lieu as number), lieu_until: lieu ? lieuUntil || null : null,
    due_date: dueDate || null, due_text: clean(v.dueText) || null, updated_at: new Date().toISOString(),
  };
  if (loan > 0 && (deal.loan_status === "none" || !financing)) { patch.loan_status = "waiting"; patch.loan_since = new Date().toISOString().slice(0, 10); }
  if (loan <= 0 && deal.loan_status === "waiting") patch.loan_status = "none";
  const same = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "");
  const changed = Object.keys(patch).filter((k) => k !== "updated_at" && !same(typeof patch[k] === "object" ? JSON.stringify(patch[k]) : patch[k], typeof (deal as Record<string, unknown>)[k] === "object" ? JSON.stringify((deal as Record<string, unknown>)[k]) : (deal as Record<string, unknown>)[k]));
  const fmt = (c: number) => (c / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const shown = (c: number) => (c ? fmt(c) : "");
  const terms = { receivedFrom: name, address, contact, price: fmt(price), sale, dp: financing ? shown(dpNum) : "", fee: financing ? shown(fee as number) : "", institution: institution ?? "", years: financing ? years : "", dueDate,
    hasTi: (tv as number) > 0, hasLieu: (lieu as number) > 0, lieuAmount: shown(lieu as number), lieuUntil: lieu ? lieuUntil : "",
    units: unitPatches.map((u) => ({ makeType: u.make, plate: u.display, color: u.color ?? "" })) };
  const u1 = await db.from("deals").update({ ...patch, terms: { ...((deal.terms as object) ?? {}), ...terms } } as never).eq("id", dealId);
  if (u1.error) return { ok: false, error: friendlyError(u1.error.message) };
  for (const u of unitPatches) {
    const r = await db.from("deal_units").update({ make_type: u.make, plate_no: u.plate, plate_display: u.display, color: u.color }).eq("id", u.id);
    if (r.error) return { ok: false, error: friendlyError(r.error.message) };
    if (u.plate !== u.oldPlate) await (db as unknown as SupabaseClient).from("car_sales").update({ plate_no: u.plate }).eq("deal_id", dealId).eq("plate_no", u.oldPlate);
  }
  for (const r of rs ?? []) {
    const snap = { ...((r.snapshot as object) ?? {}), ...terms };
    const u = await db.from("receipts").update({ snapshot: snap, ...(after.has(r.id) ? { balance_after: after.get(r.id) } : {}) }).eq("id", r.id);
    if (u.error) return { ok: false, error: friendlyError(u.error.message) };
  }
  await (db as unknown as SupabaseClient).from("car_sales").update({ buyer: name.toUpperCase(), address: address ? address.toUpperCase() : null, contact: contact || null, agreed_price: peso(price), financing: institution ? institution.toUpperCase() : null, updated_by: user.id }).eq("deal_id", dealId);
  await db.from("audit_logs").insert({ actor_id: user.id, action: "deal.edit", entity: "deal", entity_id: dealId, before: Object.fromEntries(changed.map((k) => [k, (deal as Record<string, unknown>)[k]])) as Json, after: Object.fromEntries(changed.map((k) => [k, patch[k]])) as Json });
  revalidatePath("/", "layout");
  syncSoon();
  return { ok: true };
}

/**
 * Super Admin only: puts in a receipt that was not entered when it happened (for example the earnest money's AR, after the full payment was
 * saved first). The amount is moved out of "paid before the first receipt", so the balance does not change.
 */
export async function addEarlierReceipt(dealId: string, v: Record<string, string>): Promise<AdminResult> {
  const user = await requireRole("super_admin");
  await requireModule("deals");
  if (!uuid(dealId)) return { ok: false, error: "That deal was not found." };
  const db = createAdminClient();
  const { data: deal } = await db.from("deals").select("id, opening_paid, status").eq("id", dealId).maybeSingle();
  if (!deal || deal.status === "cancelled") return { ok: false, error: "That deal was not found." };
  const no = clean(v.no), date = clean(v.date), kind = /^par/i.test(clean(v.kind)) ? "partial" : /^full/i.test(clean(v.kind)) ? "full" : "earnest";
  const amount = toCentavos(v.amount ?? "");
  if (!no || !isDay(date)) return { ok: false, error: "The receipt number and date are required." };
  if (!amount || amount <= 0) return { ok: false, error: "The amount is not valid." };
  if (amount > Math.round(Number(deal.opening_paid ?? 0) * 100)) return { ok: false, error: "That is more than what was recorded as paid before the first receipt. Put that amount in the transaction's \"Paid before the first receipt\" first." };
  const method = /^(check|cheque)/i.test(clean(v.method)) ? "check" : "cash";
  const pesos = Number(fromCentavos(amount));
  const { data: r, error } = await db.from("receipts").insert({ deal_id: dealId, receipt_no: no, receipt_date: date, kind, amount: pesos, payout: 0, balance_after: 0, status: "approved", submitted_by: user.id, reviewed_by: user.id, reviewed_at: new Date().toISOString(), notes: [] } as never).select("id").single();
  if (error || !r) return { ok: false, error: friendlyError(error?.message ?? "") };
  await (db as unknown as SupabaseClient).from("receipt_payments").insert({ receipt_id: r.id, position: 1, method, label: method === "check" ? "Check" : "Cash", amount: pesos });
  await db.from("deals").update({ opening_paid: Number(deal.opening_paid) - pesos }).eq("id", dealId);
  await rechain(db, dealId);
  await db.from("audit_logs").insert({ actor_id: user.id, action: "receipt.add_earlier", entity: "receipt", entity_id: r.id, after: { receipt_no: no, receipt_date: date, amount: pesos, from_opening_paid: pesos } });
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
  const kind = /^par/i.test(clean(v.kind)) ? "partial" : /^full/i.test(clean(v.kind)) ? "full" : /^earn/i.test(clean(v.kind)) ? "earnest" : rc.kind;
  const u0 = await db.from("receipts").update({ receipt_no: no, receipt_date: date, amount: total, kind, remarks: clean(v.remarks) || null }).eq("id", rc.id);
  if (u0.error) return { ok: false, error: friendlyError(u0.error.message) };
  for (const a of amounts) if (a.now !== a.was * 100) await db.from("receipt_payments").update({ amount: (a.now as number) / 100 }).eq("id", a.id);
  const snap = { ...((rc.snapshot as Record<string, unknown>) ?? {}), receiptNo: no, date, kind, hasRem: !!clean(v.remarks), remarks: clean(v.remarks) };
  await db.from("receipts").update({ snapshot: snap }).eq("id", rc.id);
  await rechain(db, rc.deal_id);
  const first = (rs ?? [])[0]?.id === rc.id;
  if (first) await db.from("deals").update({ deal_no: no }).eq("id", deal.id);
  await db.from("audit_logs").insert({ actor_id: user.id, action: "receipt.edit", entity: "receipt", entity_id: rc.id, before: { receipt_no: rc.receipt_no, receipt_date: rc.receipt_date, amount: rc.amount, payments: amounts.map((a) => a.was) }, after: { receipt_no: no, receipt_date: date, amount: total, payments: amounts.map((a) => (a.now as number) / 100) } });
  revalidatePath("/", "layout");
  syncSoon();
  return { ok: true };
}
