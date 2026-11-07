"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin, requireModule } from "@/lib/auth";
import { friendlyError } from "@/lib/deal/errors";
import { toCentavos, fromCentavos } from "@/lib/rules/money";
import { createAdminClient } from "@/lib/supabase/admin";
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
  return { ok: true };
}

export async function setLoanStatus(dealId: string, status: "waiting" | "released", on: string): Promise<AdminResult> {
  const user = await requireAdmin();
  await requireModule("deals");
  if (!uuid(dealId)) return { ok: false, error: "That deal was not found." };
  const { error } = await createAdminClient().rpc("set_loan_status", { p_actor: user.id, p_deal_id: dealId, p_status: status, p_on: status === "released" && /^\d{4}-\d{2}-\d{2}$/.test(on) ? on : undefined });
  if (error) return { ok: false, error: friendlyError(error.message) };
  syncSoon();
  return { ok: true };
}
