"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireApprover } from "@/lib/auth";
import { friendlyError } from "@/lib/deal/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { processDueJobs } from "@/lib/sync/process";

export type ReviewResult = { ok: true } | { ok: false; error: string };

async function review(receiptId: string, approve: boolean, reason?: string): Promise<ReviewResult> {
  const user = await requireApprover();
  if (!/^[0-9a-f-]{36}$/i.test(receiptId)) return { ok: false, error: "That receipt was not found." };
  const { error } = await createAdminClient().rpc("review_receipt", { p_actor: user.id, p_receipt_id: receiptId, p_approve: approve, p_reason: reason });
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidatePath("/", "layout"); // every screen that shows deals, receipts or balances
  if (approve) {
    // Drive, Sheets, Telegram and the inventory sheet update after approval; a failure stays queued and retries.
    after(() => processDueJobs({ receiptId }).catch((e) => console.error(`[sync] after approval failed: ${e instanceof Error ? e.message : "unknown"}`)));
  }
  return { ok: true };
}

export async function approveReceipt(receiptId: string): Promise<ReviewResult> {
  return review(receiptId, true);
}

export async function rejectReceipt(receiptId: string, reason: string): Promise<ReviewResult> {
  return review(receiptId, false, reason);
}
