"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireModule } from "@/lib/auth";
import { getSettings } from "@/lib/data";
import { friendlyError } from "@/lib/deal/errors";
import { formStateSchema } from "@/lib/deal/form-schema";
import { buildSubmitPayload } from "@/lib/deal/payload";
import { missingFields, totalsOf } from "@/lib/deal/validate";
import type { FormState } from "@/lib/deal/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { processDueJobs } from "@/lib/sync/process";

export type SubmitResult =
  | { ok: true; dealId: string; receiptId: string; dealNo: string; receiptNo: string; balanceAfter: string }
  | { ok: false; error: string; missing?: string[] };

/**
 * Sends a filled-in receipt to the Approver. The checks run again here and in the database, which
 * also recomputes every number from the raw amounts: nothing is trusted from the screen.
 */
export async function submitReceipt(input: unknown, dealId: string | null): Promise<SubmitResult> {
  const user = await requireModule("new");
  const parsed = formStateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The form could not be read. Reload the page and try again." };
  const state = parsed.data as FormState;
  const settings = await getSettings();

  const missing = missingFields(state, totalsOf(state), settings, { continuing: !!dealId });
  if (missing.length) return { ok: false, error: "Fill in the missing fields first.", missing: missing.map((m) => m.label) };

  const payload = buildSubmitPayload(state, dealId);
  const { data, error } = await createAdminClient().rpc("submit_receipt", {
    p_actor: user.id, p_payload: payload as unknown as Json, p_require_proofs: settings.required.proofs,
  });
  if (error) {
    console.warn(`[submit] refused: ${error.message.slice(0, 80)}`);
    return { ok: false, error: friendlyError(error.message) };
  }
  const r = data as { deal_id: string; receipt_id: string; deal_no: string; receipt_no: string; balance_after: string | number };
  revalidatePath("/deals");
  revalidatePath("/approvals");
  // The first receipt of a deal queues "find the car's document folder by plate"; run it now instead of waiting for the next cron.
  after(() => processDueJobs({ receiptId: r.receipt_id }).catch((e) => console.error(`[sync] after submit failed: ${e instanceof Error ? e.message : "unknown"}`)));
  return { ok: true, dealId: r.deal_id, receiptId: r.receipt_id, dealNo: r.deal_no, receiptNo: r.receipt_no, balanceAfter: String(r.balance_after) };
}
