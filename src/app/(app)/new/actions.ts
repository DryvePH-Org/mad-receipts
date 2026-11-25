"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireModule } from "@/lib/auth";
import { firstNameOf, salespeopleNames } from "@/lib/deal/salespeople";
import { isAdmin } from "@/lib/roles";
import { getSettings } from "@/lib/data";
import { friendlyError } from "@/lib/deal/errors";
import { formStateSchema } from "@/lib/deal/form-schema";
import { buildSubmitPayload } from "@/lib/deal/payload";
import { missingFields, totalsOf } from "@/lib/deal/validate";
import type { FormState } from "@/lib/deal/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { receiptSaved } from "@/lib/notify/events";
import { processDueJobs } from "@/lib/sync/process";
import { TELEGRAM_QUIET_DAYS } from "@/lib/sync/targets";
import { manilaToday } from "@/lib/dates";

export type SubmitResult =
  | { ok: true; dealId: string; receiptId: string; dealNo: string; receiptNo: string; balanceAfter: string }
  | { ok: false; error: string; missing?: string[] };

/**
 * Saves a filled-in receipt: it is final at once. The checks run again here and in the database, which
 * also recomputes every number from the raw amounts: nothing is trusted from the screen.
 */
export async function submitReceipt(input: unknown, dealId: string | null): Promise<SubmitResult> {
  const user = await requireModule("new");
  const parsed = formStateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The form could not be read. Reload the page and try again." };
  const state = parsed.data as FormState;
  const admin = isAdmin(user.role);
  // who sold the car: Sales are themselves; an Admin chooses one of the people with the Sales role (needed when a new deal starts)
  if (!dealId) {
    if (admin) {
      const people = await salespeopleNames();
      if (state.soldBy && !people.includes(state.soldBy.toUpperCase())) return { ok: false, error: "Choose who sold it from the list (people with the Sales role)." };
      state.soldBy = state.soldBy.toUpperCase();
    } else state.soldBy = firstNameOf(user.fullName);
  }
  state.skipProofs = admin && state.skipProofs; // only an Admin may save without the proof photos
  const settings = await getSettings();
  const effective = state.skipProofs ? { ...settings, required: { ...settings.required, proofs: false } } : settings;

  const missing = missingFields(state, totalsOf(state), effective, { continuing: !!dealId, needsSoldBy: admin && !dealId });
  if (missing.length) return { ok: false, error: "Fill in the missing fields first.", missing: missing.map((m) => m.label) };

  const payload = buildSubmitPayload(state, dealId);
  const { data, error } = await createAdminClient().rpc("submit_receipt", {
    p_actor: user.id, p_payload: payload as unknown as Json, p_require_proofs: effective.required.proofs,
  });
  if (error) {
    console.warn(`[submit] refused: ${error.message.slice(0, 80)}`);
    return { ok: false, error: friendlyError(error.message) };
  }
  const r = data as { deal_id: string; receipt_id: string; deal_no: string; receipt_no: string; balance_after: string | number };
  revalidatePath("/", "layout"); // every screen that shows deals, receipts or balances
  // What the database queued on saving (the car's status, the Drive audit copy, Telegram, the car's folder link) runs now instead of waiting for the next cron.
  after(async () => {
    await processDueJobs({ receiptId: r.receipt_id }).catch((e) => console.error(`[sync] after submit failed: ${e instanceof Error ? e.message : "unknown"}`));
    // the jobs have just changed the car's state and the sale: the screens that show them are made fresh
    try { revalidatePath("/cars"); revalidatePath("/documents", "layout"); revalidatePath("/deals", "layout"); } catch { /* the next visit shows it anyway */ }
  });
  if (!TELEGRAM_QUIET_DAYS.includes(manilaToday())) after(() => receiptSaved(r.receipt_id)); // the deal's owner hears when it settles the deal (not on a quiet day)
  return { ok: true, dealId: r.deal_id, receiptId: r.receipt_id, dealNo: r.deal_no, receiptNo: r.receipt_no, balanceAfter: String(r.balance_after) };
}
