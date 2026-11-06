"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { safeDbMessage } from "@/lib/pcf/db-error";
import { actionError, type ActionResult } from "@/lib/pcf/action-result";
import { getCurrentUser } from "@/lib/pcf/auth";
import { toMoneyNumber } from "@/lib/pcf/money";
import {
  notifyLowBalance,
  notifyVoucherApproved,
  notifyVoucherFlagged,
  notifyVoucherPreApproved,
  notifyVoucherReleased,
  notifyVoucherReturned,
  notifyVoucherSubmitted,
  notifyVoucherVoided,
} from "@/lib/pcf/notifications/events";
import { mirrorVoucherPhoto } from "@/lib/pcf/drive-mirror";
import { queueNotification } from "@/lib/pcf/notifications/deliver";
import { withinLimit } from "@/lib/pcf/rate-limit";
import { createClient } from "@/lib/supabase/server";
import {
  createVoucherSchema,
  noReceiptReasonSchema,
  receiptPathSchema,
  voucherReasonSchema,
  updateVoucherSchema,
  type CreateVoucherValues,
  type UpdateVoucherValues,
} from "@/lib/pcf/validators/voucher";

export type CreateVoucherResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };

function validationError(input: z.ZodError): ActionResult {
  const fieldErrors = z.flattenError(input).fieldErrors as Record<
    string,
    string[]
  >;
  return actionError("Check the highlighted fields.", fieldErrors);
}

function createVoucherError(
  error: string,
  fieldErrors?: Record<string, string[]>,
): CreateVoucherResult {
  return { ok: false, error, fieldErrors };
}

function createVoucherValidationError(input: z.ZodError): CreateVoucherResult {
  const fieldErrors = z.flattenError(input).fieldErrors as Record<
    string,
    string[]
  >;
  return createVoucherError("Check the highlighted fields.", fieldErrors);
}

async function fundIsLow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fundId: string,
) {
  const { data } = await supabase
    .from("fund_balance_v")
    .select("is_low")
    .eq("fund_id", fundId)
    .maybeSingle();
  return Boolean(data?.is_low);
}

function revalidateVoucher(id: string) {
  revalidatePath("/pcf/vouchers");
  revalidatePath(`/pcf/vouchers/${id}`);
  revalidatePath("/pcf/approvals");
  revalidatePath("/pcf");
}

export async function createVoucher(
  input: CreateVoucherValues,
): Promise<CreateVoucherResult> {
  const user = await getCurrentUser();
  if (!user) return createVoucherError("Sign in to create a voucher.");

  const parsed = createVoucherSchema.safeParse(input);
  if (!parsed.success) return createVoucherValidationError(parsed.error);

  // A runaway script or stolen session cannot flood the ledger with vouchers.
  if (!(await withinLimit(`voucher:create:${user.id}`, 40, 60))) {
    return createVoucherError("You are creating vouchers too quickly. Wait a minute and try again.");
  }

  const values = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_voucher_lines", {
    p_fund_id: values.fund_id,
    p_payee: values.payee,
    p_items: values.items.map((item) => ({
      particulars: item.particulars,
      amount: toMoneyNumber(item.amount),
      category_id: item.category_id,
    })),
    p_voucher_date: values.voucher_date,
    p_no_receipt_reason: values.no_receipt_reason?.trim() || undefined,
  });

  if (error) return createVoucherError(safeDbMessage(error));

  revalidatePath("/pcf/vouchers");
  return { ok: true, id: data as string };
}

export async function updateVoucher(
  input: UpdateVoucherValues,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in to edit a voucher.");

  const parsed = updateVoucherSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const values = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_voucher_lines", {
    p_id: values.voucher_id,
    p_payee: values.payee,
    p_items: values.items.map((item) => ({
      particulars: item.particulars,
      amount: toMoneyNumber(item.amount),
      category_id: item.category_id,
    })),
    p_voucher_date: values.voucher_date,
  });
  if (error) return actionError(safeDbMessage(error));

  revalidateVoucher(values.voucher_id);
  return { ok: true };
}

export async function setVoucherReceipt(
  input: z.input<typeof receiptPathSchema>,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in to attach a receipt.");

  const parsed = receiptPathSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const { voucher_id, receipt_path } = parsed.data;
  const supabase = await createClient();

  const { data: voucher, error: readError } = await supabase
    .from("vouchers")
    .select("id, fund_id, status, prepared_by")
    .eq("id", voucher_id)
    .maybeSingle();

  if (readError) return actionError(readError.message);
  if (!voucher) return actionError("Voucher not found.");
  if (voucher.status !== "draft") {
    return actionError("Only drafts can take a new receipt.");
  }
  if (voucher.prepared_by !== user.id) {
    return actionError("Only the person who prepared this voucher can attach its receipt.");
  }
  if (!receipt_path.startsWith(`${voucher.fund_id}/${voucher.id}/`)) {
    return actionError("The receipt path does not match this voucher.");
  }

  const { data: updated, error } = await supabase
    .from("vouchers")
    .update({ receipt_path, no_receipt_reason: null })
    .eq("id", voucher_id)
    .select("id");

  if (error) return actionError(safeDbMessage(error));
  if (!updated || updated.length === 0) {
    return actionError("Could not attach the receipt to this voucher.");
  }

  queueNotification("drive:receipt", () => mirrorVoucherPhoto(voucher_id, "receipt"));
  revalidateVoucher(voucher_id);
  return { ok: true };
}

// The signed paper voucher the custodian photographed. It is kept with the
// voucher (and copied to Drive) but is separate from the store receipt.
export async function attachPaperVoucher(
  input: z.input<typeof receiptPathSchema>,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in to attach a photo.");

  const parsed = receiptPathSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const { voucher_id, receipt_path } = parsed.data;
  const supabase = await createClient();

  const { data: voucher, error: readError } = await supabase
    .from("vouchers")
    .select("id, fund_id, status, prepared_by")
    .eq("id", voucher_id)
    .maybeSingle();
  if (readError) return actionError(safeDbMessage(readError));
  if (!voucher) return actionError("Voucher not found.");
  if (voucher.status !== "draft") return actionError("Only drafts can take a new photo.");
  if (voucher.prepared_by !== user.id) {
    return actionError("Only the person who prepared this voucher can attach its photo.");
  }
  if (!receipt_path.startsWith(`${voucher.fund_id}/${voucher.id}/`)) {
    return actionError("The photo path does not match this voucher.");
  }

  const { data: updated, error } = await supabase
    .from("vouchers")
    .update({ paper_voucher_path: receipt_path })
    .eq("id", voucher_id)
    .select("id");
  if (error) return actionError(safeDbMessage(error));
  if (!updated || updated.length === 0) {
    return actionError("Could not attach the photo to this voucher.");
  }

  queueNotification("drive:paper", () => mirrorVoucherPhoto(voucher_id, "paper"));
  revalidateVoucher(voucher_id);
  return { ok: true };
}

export async function setNoReceiptReason(
  input: z.input<typeof noReceiptReasonSchema>,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in to update this voucher.");

  const parsed = noReceiptReasonSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const { voucher_id, reason } = parsed.data;
  const supabase = await createClient();

  const { data: voucher, error: readError } = await supabase
    .from("vouchers")
    .select("id, status, prepared_by")
    .eq("id", voucher_id)
    .maybeSingle();

  if (readError) return actionError(readError.message);
  if (!voucher) return actionError("Voucher not found.");
  if (voucher.status !== "draft") {
    return actionError("Only drafts can take a new no-receipt reason.");
  }
  if (voucher.prepared_by !== user.id) {
    return actionError("Only the person who prepared this voucher can update it.");
  }

  const { data: updated, error } = await supabase
    .from("vouchers")
    .update({ no_receipt_reason: reason })
    .eq("id", voucher_id)
    .select("id");

  if (error) return actionError(safeDbMessage(error));
  if (!updated || updated.length === 0) {
    return actionError("Could not update this voucher.");
  }

  revalidateVoucher(voucher_id);
  return { ok: true };
}

export async function releaseVoucher(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in to release cash.");

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("vouchers")
    .select("fund_id, status")
    .eq("id", id)
    .maybeSingle();
  const wasLow = before ? await fundIsLow(supabase, before.fund_id) : true;

  const { error } = await supabase.rpc("release_voucher", { p_id: id });
  if (error) return actionError(safeDbMessage(error));

  const nowLow = before ? await fundIsLow(supabase, before.fund_id) : false;
  // A pre-approved voucher has already been reviewed, so approvers aren't
  // asked to review it again.
  if (before?.status !== "approved") {
    queueNotification("voucher.released", () => notifyVoucherReleased(id, user.id));
  }
  if (before && nowLow && !wasLow) {
    const fundId = before.fund_id;
    queueNotification("fund.low_balance", () => notifyLowBalance(fundId));
  }

  revalidateVoucher(id);
  return { ok: true };
}

export async function approveVoucher(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in to review vouchers.");

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("vouchers")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.rpc("approve_voucher", { p_id: id });
  if (error) return actionError(safeDbMessage(error));

  if (before?.status === "submitted") {
    queueNotification("voucher.pre_approved", () =>
      notifyVoucherPreApproved(id, user.id),
    );
  } else {
    queueNotification("voucher.approved", () => notifyVoucherApproved(id, user.id));
  }
  revalidateVoucher(id);
  return { ok: true };
}

export async function submitVoucher(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in to submit vouchers.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_voucher", { p_id: id });
  if (error) return actionError(safeDbMessage(error));

  queueNotification("voucher.submitted", () => notifyVoucherSubmitted(id, user.id));
  revalidateVoucher(id);
  return { ok: true };
}

export async function returnVoucher(
  input: z.input<typeof voucherReasonSchema>,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in to review vouchers.");

  const parsed = voucherReasonSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("return_voucher", {
    p_id: parsed.data.voucher_id,
    p_reason: parsed.data.reason,
  });
  if (error) return actionError(safeDbMessage(error));

  const returnedId = parsed.data.voucher_id;
  queueNotification("voucher.returned", () => notifyVoucherReturned(returnedId, user.id));
  revalidateVoucher(returnedId);
  return { ok: true };
}

export async function flagVoucher(
  input: z.input<typeof voucherReasonSchema>,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in to review vouchers.");

  const parsed = voucherReasonSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_voucher", {
    p_id: parsed.data.voucher_id,
    p_reason: parsed.data.reason,
  });
  if (error) return actionError(safeDbMessage(error));

  const flaggedId = parsed.data.voucher_id;
  queueNotification("voucher.flagged", () => notifyVoucherFlagged(flaggedId, user.id));
  revalidateVoucher(parsed.data.voucher_id);
  return { ok: true };
}

export async function voidVoucher(
  input: z.input<typeof voucherReasonSchema>,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in to void vouchers.");

  const parsed = voucherReasonSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_voucher", {
    p_id: parsed.data.voucher_id,
    p_reason: parsed.data.reason,
  });
  if (error) return actionError(safeDbMessage(error));

  const voidedId = parsed.data.voucher_id;
  queueNotification("voucher.voided", () => notifyVoucherVoided(voidedId, user.id));
  revalidateVoucher(parsed.data.voucher_id);
  return { ok: true };
}
