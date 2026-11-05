import { daysBetween } from "@/lib/dates";
import { formatPeso } from "@/lib/rules/money";
import { formatDate } from "@/lib/dates";
import type { AppSettings } from "./settings";

/** Pesos from the database (a number or a string) as whole centavos. May be negative. */
export const centsOf = (value: number | string | null | undefined): number => Math.round(Number(value ?? 0) * 100);

export type DealStatusKey = "overdue" | "soon" | "open" | "lender" | "settled" | "cancelled";

export const STATUS_LABELS: Record<DealStatusKey, string> = {
  overdue: "Overdue", soon: "Due soon", open: "Open", lender: "Waiting for lender", settled: "Settled", cancelled: "Cancelled",
};
export const STATUS_ORDER: DealStatusKey[] = ["overdue", "soon", "open", "lender", "settled", "cancelled"];

export interface StatusInput {
  status: string;
  /** Centavos still owed by the buyer (approved receipts only). */
  balance: number;
  due_date: string | null;
  sale_type: string;
  loan_status: string;
}

/** Due within this many days counts as "due soon". */
export const SOON_DAYS = 7;

export function dealStatusKey(d: StatusInput, today: string): DealStatusKey {
  if (d.status === "cancelled") return "cancelled";
  if (d.balance > 0) {
    if (d.due_date) {
      const left = daysBetween(today, d.due_date);
      if (left < 0) return "overdue";
      if (left <= SOON_DAYS) return "soon";
    }
    return "open";
  }
  if (d.sale_type === "financing" && d.loan_status !== "released") return "lender";
  return "settled";
}

/** "in 3 days", "today", "5 days late". */
export function relativeDay(date: string, today: string): string {
  const n = daysBetween(today, date);
  if (n === 0) return "today";
  if (n > 0) return `in ${n} ${n === 1 ? "day" : "days"}`;
  return `${-n} ${n === -1 ? "day" : "days"} late`;
}

// ---------------- reminders ----------------

export interface NotifyDeal extends StatusInput {
  id: string;
  buyer_name: string;
  institution: string | null;
  loan_amount: number | string;
  lieu_amount: number | string;
  lieu_until: string | null;
  loan_since: string | null;
  created_by: string;
  unit_name: string;
}
export interface NotifyReceipt {
  id: string;
  receipt_no: string;
  deal_id: string;
  buyer_name: string;
  unit_name: string;
  amount: number | string;
  status: string;
  submitted_by: string;
  submitted_at: string;
  reject_reason: string | null;
}
export type NotifyLevel = "red" | "amber" | "blue" | "purple";
export interface Notification {
  key: string;
  level: NotifyLevel;
  icon: "warn" | "clock" | "bank" | "file" | "shield" | "x";
  title: string;
  detail: string;
  dealId: string;
  /** Who should see it: the person who opened the deal, or everyone holding that role. */
  audience: { userId?: string; role?: "approver" };
  rank: number;
}

export function buildNotifications(
  deals: NotifyDeal[], receipts: NotifyReceipt[], settings: AppSettings["reminders"], today: string, nowMs: number = Date.now(),
): Notification[] {
  const out: Notification[] = [];
  for (const d of deals) {
    if (d.status === "cancelled") continue;
    const st = dealStatusKey(d, today), name = `${d.buyer_name} · ${d.unit_name}`;
    const left = d.due_date ? daysBetween(today, d.due_date) : null;
    const owner = { userId: d.created_by };
    if (st === "overdue" && d.due_date && left !== null) {
      out.push({ key: `od-${d.id}`, level: "red", icon: "warn", title: `Overdue: ${name}`, detail: `${formatPeso(d.balance)} was due ${formatDate(d.due_date)}, ${-left} ${-left === 1 ? "day" : "days"} late.`, dealId: d.id, audience: owner, rank: left / 1000 });
    } else if (d.balance > 0 && left !== null && left >= 0 && ((left === 0 && settings.dueDay) || (left > 0 && left <= 3 && settings.before3) || (left > 3 && left <= 7 && settings.before7))) {
      out.push({ key: `due-${d.id}`, level: "amber", icon: "clock", title: `${left === 0 ? "Due today" : `Due in ${left} ${left === 1 ? "day" : "days"}`}: ${name}`, detail: `${formatPeso(d.balance)} is still to be paid by ${formatDate(d.due_date!)}.`, dealId: d.id, audience: owner, rank: 10 + left });
    }
    if (st === "lender" && d.loan_since) {
      const waited = daysBetween(d.loan_since, today);
      if (waited >= settings.lenderDays) out.push({ key: `ln-${d.id}`, level: "blue", icon: "bank", title: `Waiting for ${d.institution}: ${name}`, detail: `The buyer's part is paid. The ${formatPeso(centsOf(d.loan_amount))} loan has been pending for ${waited} days.`, dealId: d.id, audience: owner, rank: 30 - waited / 100 });
    }
    const lieu = centsOf(d.lieu_amount);
    if (lieu > 0 && d.balance > 0 && d.lieu_until) {
      const k = daysBetween(today, d.lieu_until);
      if (k <= 7) out.push({ key: `li-${d.id}`, level: k < 0 ? "red" : "amber", icon: "file", title: `${k < 0 ? "Collateral date passed" : "Collateral date coming"}: ${name}`, detail: `We hold the buyer's documents for ${formatPeso(lieu)} until ${formatDate(d.lieu_until)} (${k < 0 ? `${-k} days ago` : k === 0 ? "today" : `in ${k} days`}).`, dealId: d.id, audience: owner, rank: 20 + k });
    }
  }
  for (const r of receipts) {
    if (r.status === "pending") {
      const hours = (nowMs - Date.parse(r.submitted_at)) / 3_600_000;
      if (hours >= settings.approvalHours) {
        const days = Math.max(1, Math.floor(hours / 24));
        out.push({ key: `ap-${r.id}`, level: "purple", icon: "shield", title: `Waiting for approval: receipt ${r.receipt_no}`, detail: `${r.buyer_name} · ${r.unit_name}: ${formatPeso(centsOf(r.amount))} has waited ${days} ${days === 1 ? "day" : "days"}.`, dealId: r.deal_id, audience: { role: "approver" }, rank: 25 });
      }
    }
    if (r.status === "rejected" && r.reject_reason && r.reject_reason !== "The deal was cancelled") {
      out.push({ key: `rj-${r.id}`, level: "red", icon: "x", title: `Rejected: receipt ${r.receipt_no}`, detail: `${r.buyer_name} · ${r.unit_name}: ${r.reject_reason} Fill in a new receipt.`, dealId: r.deal_id, audience: { userId: r.submitted_by }, rank: 5 });
    }
  }
  return out.sort((a, b) => a.rank - b.rank);
}

/** What one person should see: the Admin everything, the Approver approval items and red alerts, Sales their own deals. */
export function notificationsFor(list: Notification[], user: { id: string; role: "sales" | "admin" | "approver" }): Notification[] {
  if (user.role === "admin") return list;
  if (user.role === "approver") return list.filter((n) => n.audience.role === "approver" || n.level === "red");
  return list.filter((n) => n.audience.userId === user.id);
}
