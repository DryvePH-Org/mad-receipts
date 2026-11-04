"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { processDueJobs } from "@/lib/sync/process";

export type ActionResult = { ok: boolean; message: string } | null;

// The database functions raise short codes; these are what the admin sees.
const ERRORS: Record<string, string> = {
  reason_required: "Enter a reason (at least 3 characters).",
  receipt_not_found: "That receipt was not found.",
  already_voided: "That receipt is already voided.",
  deal_cancelled: "This deal is cancelled, so its receipts can't be voided.",
  not_latest: "Only the latest receipt can be voided. Void the newer receipts first.",
  only_receipt: "This is the only receipt on the deal. Cancel the deal instead.",
  plate_has_open_deal: "This plate already has another open deal, so this sold deal can't be reopened.",
  deal_not_found: "That deal was not found.",
  deal_not_open: "Only an open (reserved) deal can be cancelled. For a sold deal, void its latest receipt first.",
  missing_buyer_name: "The buyer's name can't be empty.",
  invalid_details: "Some details are too long or not valid.",
  invalid_terms: "Check how the sale is paid: a loan or a trade-in value must be more than zero and less than the agreed price.",
  overpayment: "The buyer has already paid more than these terms would leave them owing.",
  terms_would_complete: "These amounts would leave nothing to pay. Confirm the last receipt instead.",
  invalid_salespeople: "Check the salespeople: each needs a name from the list and a commission % from 0 to 100.",
};

const friendly = (message: string) => ERRORS[message] ?? "Something went wrong. Please try again.";

/** Starts the Drive/Sheets/Telegram/inventory updates after responding. Failures stay queued. */
function syncSoon() {
  after(() =>
    processDueJobs().catch((err) =>
      console.error(`[sync] after admin action failed: ${err instanceof Error ? err.message : "unknown"}`),
    ),
  );
}

const reason = z.string().trim().min(3, ERRORS.reason_required).max(300, "Keep the reason under 300 characters.");

export async function voidReceipt(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();
  const parsed = z.object({ receiptId: z.uuid(), reason }).safeParse({
    receiptId: form.get("receiptId"),
    reason: form.get("reason"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const { data, error } = await createAdminClient().rpc("void_receipt", {
    p_actor: actor.id,
    p_receipt_id: parsed.data.receiptId,
    p_reason: parsed.data.reason,
  });
  if (error) return { ok: false, message: friendly(error.message) };

  const result = data as { receipt_no: string; deal_id: string };
  syncSoon();
  revalidatePath(`/deals/${result.deal_id}`);
  revalidatePath("/deals");
  return { ok: true, message: `Receipt No. ${result.receipt_no} voided.` };
}

export async function cancelDeal(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();
  const parsed = z.object({ dealId: z.uuid(), reason }).safeParse({
    dealId: form.get("dealId"),
    reason: form.get("reason"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const { error } = await createAdminClient().rpc("cancel_deal", {
    p_actor: actor.id,
    p_deal_id: parsed.data.dealId,
    p_reason: parsed.data.reason,
    p_forfeit: form.get("forfeit") === "on",
  });
  if (error) return { ok: false, message: friendly(error.message) };

  syncSoon();
  revalidatePath(`/deals/${parsed.data.dealId}`);
  revalidatePath("/deals");
  return { ok: true, message: "Deal cancelled. The unit is available again." };
}

const optionalText = (max: number) => z.string().trim().max(max, "One of the details is too long.");

const editSchema = z.object({
  dealId: z.uuid(),
  buyer_name: optionalText(200).min(1, ERRORS.missing_buyer_name),
  buyer_address: optionalText(300),
  buyer_contact: optionalText(50),
  make_type: optionalText(100),
  color: optionalText(50),
  motor_no: optionalText(50),
  chassis_no: optionalText(50),
  salespeople: z
    .array(z.object({ salespersonId: z.uuid(), commissionPercent: z.number().min(0).max(100) }))
    .max(5),
  // Only sent when the deal's terms were changed.
  terms: z
    .object({
      transaction_type: z.enum(["cash", "financing", "trade_in"]),
      trade_in_value: z.string().regex(/^\d{1,10}\.\d{2}$/),
      trade_in_details: z.string().trim().max(200).nullable(),
      loan_amount: z.string().regex(/^\d{1,10}\.\d{2}$/),
      processing_fee: z.string().regex(/^\d{1,10}\.\d{2}$/),
      financier: z.string().trim().max(100).nullable(),
    })
    .optional(),
});

export async function editDeal(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();

  let salespeople: unknown = [];
  let terms: unknown = undefined;
  try {
    salespeople = JSON.parse(String(form.get("salespeople") || "[]"));
    if (form.get("terms")) terms = JSON.parse(String(form.get("terms")));
  } catch {
    return { ok: false, message: ERRORS.invalid_salespeople };
  }
  const parsed = editSchema.safeParse({
    dealId: form.get("dealId"),
    buyer_name: form.get("buyer_name") ?? "",
    buyer_address: form.get("buyer_address") ?? "",
    buyer_contact: form.get("buyer_contact") ?? "",
    make_type: form.get("make_type") ?? "",
    color: form.get("color") ?? "",
    motor_no: form.get("motor_no") ?? "",
    chassis_no: form.get("chassis_no") ?? "",
    salespeople,
    terms,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { dealId, salespeople: people, terms: newTerms, ...details } = parsed.data;

  const { error } = await createAdminClient().rpc("update_deal_details", {
    p_actor: actor.id,
    p_deal_id: dealId,
    p_patch: { ...details, ...(newTerms ?? {}) },
    // An empty list means "leave the salespeople as they are".
    p_salespeople: people.map((p) => ({
      salesperson_id: p.salespersonId,
      commission_percent: p.commissionPercent.toFixed(2),
    })),
  });
  if (error) return { ok: false, message: friendly(error.message) };

  syncSoon();
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/deals");
  return { ok: true, message: "Details saved." };
}
