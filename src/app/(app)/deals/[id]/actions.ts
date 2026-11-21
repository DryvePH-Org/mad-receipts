"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin, requireModule } from "@/lib/auth";
import { friendlyError } from "@/lib/deal/errors";
import { toCentavos, fromCentavos } from "@/lib/rules/money";
import { createAdminClient } from "@/lib/supabase/admin";
import { loanReleased, transactionDeleted, voidedOrCancelled } from "@/lib/notify/events";
import { deleteTransaction } from "@/lib/deal/delete-server";
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
