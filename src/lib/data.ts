import "server-only";
import { cache } from "react";
import { manilaToday } from "@/lib/dates";
import type { CurrentUser } from "@/lib/auth";
import { buildNotifications, centsOf, notificationsFor, type Notification } from "@/lib/deal/status";
import { parseSettings, type AppSettings } from "@/lib/deal/settings";
import type { FormState, LoanStatus, SaleType } from "@/lib/deal/types";
import { createClient } from "@/lib/supabase/server";
import type { Json, Tables } from "@/lib/supabase/database.types";

// Reads for the pages. They run as the signed-in user, so the database's access rules still apply.

export const getSettings = cache(async (): Promise<AppSettings> => {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("config").eq("id", 1).maybeSingle();
  return parseSettings(data?.config);
});

export interface UnitView {
  make_type: string;
  plate: string;
  plate_no: string;
  motor: string | null;
  chassis: string | null;
  color: string | null;
}

/** A deal, with money in whole centavos. */
export interface DealView {
  id: string;
  dealNo: string;
  buyerName: string;
  buyerAddress: string | null;
  buyerContact: string | null;
  saleType: SaleType;
  institution: string | null;
  price: number;
  downPayment: number;
  due: number;
  loan: number;
  fee: number;
  monthly: number;
  years: number;
  /** Received before the first receipt in the system. */
  openingPaid: number;
  tradeIn: number;
  tradeInInfo: { year?: string; unit?: string; plate?: string; mileage?: string } | null;
  lieu: number;
  lieuUntil: string | null;
  dueDate: string | null;
  dueText: string | null;
  loanStatus: LoanStatus;
  loanSince: string | null;
  loanReleasedOn: string | null;
  status: "open" | "cancelled";
  cancelledAt: string | null;
  cancelReason: string | null;
  refund: number;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  approvedPaid: number;
  approvedPayout: number;
  pendingPaid: number;
  pendingCount: number;
  approvedCount: number;
  /** Counting approved receipts only. */
  balance: number;
  units: UnitView[];
  unitName: string;
  plates: string;
  receiptNos: string;
  terms: Partial<FormState>;
}

type DealRow = Tables<"deal_summaries">;

export function toDealView(r: DealRow): DealView {
  const units = (Array.isArray(r.units) ? r.units : []) as unknown as UnitView[];
  return {
    id: r.id, dealNo: r.deal_no, buyerName: r.buyer_name, buyerAddress: r.buyer_address, buyerContact: r.buyer_contact,
    saleType: r.sale_type as SaleType, institution: r.institution, price: centsOf(r.agreed_price), downPayment: centsOf(r.down_payment),
    due: centsOf(r.amount_due), loan: centsOf(r.loan_amount), fee: centsOf(r.processing_fee), monthly: centsOf(r.monthly_payment),
    years: Number(r.years ?? 0), openingPaid: centsOf(r.opening_paid), tradeIn: centsOf(r.trade_in_value), tradeInInfo: (r.trade_in as DealView["tradeInInfo"]) ?? null,
    lieu: centsOf(r.lieu_amount), lieuUntil: r.lieu_until, dueDate: r.due_date, dueText: r.due_text, loanStatus: r.loan_status as LoanStatus,
    loanSince: r.loan_since, loanReleasedOn: r.loan_released_on, status: r.status as DealView["status"], cancelledAt: r.cancelled_at,
    cancelReason: r.cancel_reason, refund: centsOf(r.refund_amount), createdBy: r.created_by, createdByName: r.created_by_name ?? "",
    createdAt: r.created_at, approvedPaid: centsOf(r.approved_paid), approvedPayout: centsOf(r.approved_payout), pendingPaid: centsOf(r.pending_paid),
    pendingCount: Number(r.pending_count), approvedCount: Number(r.approved_count), balance: centsOf(r.balance), units,
    unitName: units.map((u) => u.make_type || u.plate).join(" + "), plates: units.map((u) => u.plate).join(", "),
    receiptNos: r.receipt_nos ?? "", terms: (r.terms ?? {}) as Partial<FormState>,
  };
}

export async function listDeals(): Promise<DealView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("deal_summaries").select("*").order("created_at", { ascending: false }).limit(2000);
  if (error) throw new Error("Could not load the deals");
  return data.map(toDealView);
}

export async function getDeal(id: string): Promise<DealView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("deal_summaries").select("*").eq("id", id).maybeSingle();
  return data ? toDealView(data) : null;
}

export interface PaymentView {
  id: string;
  method: "cash" | "check" | "wallet";
  label: string;
  amount: number;
  reference: string | null;
  checkNo: string | null;
  bank: string | null;
  branch: string | null;
  proofs: number;
}

export interface ReceiptView {
  id: string;
  receiptNo: string;
  dealId: string;
  dealNo: string;
  buyerName: string;
  saleType: SaleType;
  date: string;
  kind: "earnest" | "partial" | "full";
  amount: number;
  payout: number;
  balanceAfter: number;
  status: "pending" | "approved" | "rejected" | "void";
  submittedBy: string;
  submittedByName: string;
  submittedAt: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  voidReason: string | null;
  payments: PaymentView[];
  payoutProofs: number;
  snapshot: Partial<FormState>;
}

type ReceiptRow = Tables<"receipt_list">;

function toReceiptView(r: ReceiptRow): ReceiptView {
  const payments = (Array.isArray(r.payments) ? r.payments : []) as unknown as Record<string, unknown>[];
  return {
    id: r.id, receiptNo: r.receipt_no, dealId: r.deal_id, dealNo: r.deal_no, buyerName: r.buyer_name, saleType: r.sale_type as SaleType,
    date: r.receipt_date, kind: r.kind as ReceiptView["kind"], amount: centsOf(r.amount), payout: centsOf(r.payout), balanceAfter: centsOf(r.balance_after),
    status: r.status as ReceiptView["status"], submittedBy: r.submitted_by, submittedByName: r.submitted_by_name ?? "", submittedAt: r.submitted_at,
    reviewedByName: r.reviewed_by_name, reviewedAt: r.reviewed_at, rejectReason: r.reject_reason, voidReason: r.void_reason,
    payments: payments.map((p) => ({
      id: String(p.id), method: p.method as PaymentView["method"], label: String(p.label), amount: centsOf(p.amount as number),
      reference: (p.reference as string | null) ?? null, checkNo: (p.check_no as string | null) ?? null, bank: (p.bank as string | null) ?? null,
      branch: (p.branch as string | null) ?? null, proofs: Number(p.proofs ?? 0),
    })),
    payoutProofs: Number(r.payout_proofs ?? 0), snapshot: (r.snapshot ?? {}) as Partial<FormState>,
  };
}

export async function receiptsOfDeal(dealId: string): Promise<ReceiptView[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("receipt_list").select("*").eq("deal_id", dealId).order("created_at", { ascending: true });
  return (data ?? []).map(toReceiptView);
}

export async function getReceipt(id: string): Promise<ReceiptView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("receipt_list").select("*").eq("id", id).maybeSingle();
  return data ? toReceiptView(data) : null;
}

export async function pendingReceipts(): Promise<ReceiptView[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("receipt_list").select("*").eq("status", "pending").order("submitted_at", { ascending: true }).limit(200);
  return (data ?? []).map(toReceiptView);
}

export async function recentlyDecided(limit = 8): Promise<ReceiptView[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("receipt_list").select("*").in("status", ["approved", "rejected"]).order("reviewed_at", { ascending: false, nullsFirst: false }).limit(limit);
  return (data ?? []).map(toReceiptView);
}

/** Receipts dated on a day (Manila), for the daily cash report. */
export async function receiptsOnDay(day: string): Promise<ReceiptView[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("receipt_list").select("*").eq("receipt_date", day).in("status", ["approved", "pending"]).order("created_at", { ascending: true });
  return (data ?? []).map(toReceiptView);
}

/** Signed links to the proof files of a receipt, grouped by payment (or the payout). */
export interface ActivityEntry {
  id: string;
  action: string;
  at: string;
  actor: string;
  after: Json;
  entity: string;
  entityId: string | null;
}

export async function listActivity(action?: string): Promise<ActivityEntry[]> {
  const supabase = await createClient();
  let q = supabase.from("audit_logs").select("id, action, entity, entity_id, after, created_at, actor_id").order("created_at", { ascending: false }).limit(300);
  if (action) q = q.like("action", `${action}%`);
  const { data } = await q;
  const ids = [...new Set((data ?? []).map((l) => l.actor_id).filter((x): x is string => !!x))];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name ?? "Someone"]));
  return (data ?? []).map((l) => ({ id: l.id, action: l.action, at: l.created_at, actor: l.actor_id ? (names.get(l.actor_id) ?? "Someone") : "System", after: l.after, entity: l.entity, entityId: l.entity_id }));
}

/** Everything that needs a nudge, for one person. */
export async function remindersFor(user: CurrentUser): Promise<Notification[]> {
  const [deals, settings] = await Promise.all([listDeals(), getSettings()]);
  const supabase = await createClient();
  const { data } = await supabase.from("receipt_list").select("*").in("status", ["pending", "rejected"]).order("submitted_at", { ascending: false }).limit(300);
  const receipts = (data ?? []).map(toReceiptView);
  const dealOf = new Map(deals.map((d) => [d.id, d]));
  const list = buildNotifications(
    deals.map((d) => ({
      id: d.id, status: d.status, balance: d.balance, due_date: d.dueDate, sale_type: d.saleType, loan_status: d.loanStatus, buyer_name: d.buyerName,
      institution: d.institution, loan_amount: d.loan / 100, lieu_amount: d.lieu / 100, lieu_until: d.lieuUntil, loan_since: d.loanSince, created_by: d.createdBy, unit_name: d.unitName,
    })),
    receipts.map((r) => ({ id: r.id, receipt_no: r.receiptNo, deal_id: r.dealId, buyer_name: r.buyerName, unit_name: dealOf.get(r.dealId)?.unitName ?? "", amount: r.amount / 100, status: r.status, submitted_by: r.submittedBy, submitted_at: r.submittedAt, reject_reason: r.rejectReason })),
    settings.reminders, manilaToday(),
  );
  return notificationsFor(list, user);
}
