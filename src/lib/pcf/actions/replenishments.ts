"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { safeDbMessage } from "@/lib/pcf/db-error";
import { actionError, type ActionResult } from "@/lib/pcf/action-result";
import { getCurrentUser } from "@/lib/pcf/auth";
import { queueNotification } from "@/lib/pcf/notifications/deliver";
import {
  notifyReplenishmentApproved,
  notifyReplenishmentClosed,
  notifyReplenishmentRejected,
  notifyReplenishmentSubmitted,
} from "@/lib/pcf/notifications/events";
import { canPerform } from "@/lib/pcf/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  createReplenishmentSchema,
  replenishmentIdSchema,
  replenishmentReviewSchema,
  type CreateReplenishmentValues,
  type ReplenishmentReviewValues,
} from "@/lib/pcf/validators/replenishment";

export type CreateReplenishmentResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

function validationError(error: z.ZodError): ActionResult {
  const fieldErrors = z.flattenError(error).fieldErrors as Record<
    string,
    string[]
  >;
  return actionError("Check the highlighted fields.", fieldErrors);
}

function createValidationError(
  error: z.ZodError,
): CreateReplenishmentResult {
  const fieldErrors = z.flattenError(error).fieldErrors as Record<
    string,
    string[]
  >;
  return {
    ok: false,
    error: "Check the highlighted fields.",
    fieldErrors,
  };
}

function revalidateReplenishment(id?: string) {
  revalidatePath("/pcf/replenishments");
  if (id) revalidatePath(`/pcf/replenishments/${id}`);
  revalidatePath("/pcf/vouchers");
  revalidatePath("/pcf");
}

export async function createReplenishment(
  input: CreateReplenishmentValues,
): Promise<CreateReplenishmentResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to create a replenishment." };
  if (!canPerform(user.role, "replenishment.create")) {
    return {
      ok: false,
      error: "Only custodians and administrators can create replenishments.",
    };
  }

  const parsed = createReplenishmentSchema.safeParse(input);
  if (!parsed.success) return createValidationError(parsed.error);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_replenishment", {
    p_fund_id: parsed.data.fund_id,
  });
  if (error) return { ok: false, error: safeDbMessage(error) };

  revalidateReplenishment();
  return { ok: true, id: data as string };
}

export async function submitReplenishment(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in to submit replenishments.");
  if (!canPerform(user.role, "replenishment.submit")) {
    return actionError("Only custodians and administrators can submit.");
  }

  const parsedId = replenishmentIdSchema.safeParse(id);
  if (!parsedId.success) return actionError("Replenishment not found.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_replenishment", {
    p_id: parsedId.data,
  });
  if (error) return actionError(safeDbMessage(error));

  const submittedId = parsedId.data;
  queueNotification("replenishment.submitted", () =>
    notifyReplenishmentSubmitted(submittedId, user.id),
  );
  revalidateReplenishment(parsedId.data);
  return { ok: true };
}

export async function reviewReplenishment(
  input: ReplenishmentReviewValues,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in to review replenishments.");
  if (!canPerform(user.role, "replenishment.review")) {
    return actionError("Only accounting and administrators can review.");
  }

  const parsed = replenishmentReviewSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_replenishment", {
    p_id: parsed.data.replenishment_id,
    p_approve: parsed.data.approve,
    p_note: parsed.data.note || undefined,
  });
  if (error) return actionError(safeDbMessage(error));

  const reviewedId = parsed.data.replenishment_id;
  const approved = parsed.data.approve;
  queueNotification(
    approved ? "replenishment.approved" : "replenishment.rejected",
    () =>
      approved
        ? notifyReplenishmentApproved(reviewedId, user.id)
        : notifyReplenishmentRejected(reviewedId, user.id),
  );
  revalidateReplenishment(parsed.data.replenishment_id);
  return { ok: true };
}

export async function closeReplenishment(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in to close replenishments.");
  if (!canPerform(user.role, "replenishment.close")) {
    return actionError("Only accounting and administrators can close.");
  }

  const parsedId = replenishmentIdSchema.safeParse(id);
  if (!parsedId.success) return actionError("Replenishment not found.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("close_replenishment", {
    p_id: parsedId.data,
  });
  if (error) return actionError(safeDbMessage(error));

  const closedId = parsedId.data;
  queueNotification("replenishment.closed", () =>
    notifyReplenishmentClosed(closedId, user.id),
  );
  revalidateReplenishment(parsedId.data);
  return { ok: true };
}
