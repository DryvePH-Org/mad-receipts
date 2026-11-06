"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { safeDbMessage } from "@/lib/pcf/db-error";
import { actionError, type ActionResult } from "@/lib/pcf/action-result";
import { getCurrentUser } from "@/lib/pcf/auth";
import { parseMoney, toMoneyNumber } from "@/lib/pcf/money";
import { queueNotification } from "@/lib/pcf/notifications/deliver";
import { notifyCashCountVariance } from "@/lib/pcf/notifications/events";
import { canPerform } from "@/lib/pcf/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  cashCountSchema,
  type CashCountValues,
} from "@/lib/pcf/validators/cash-count";

function validationError(error: z.ZodError): ActionResult {
  const fieldErrors = z.flattenError(error).fieldErrors as Record<
    string,
    string[]
  >;
  return actionError("Check the highlighted fields.", fieldErrors);
}

export async function recordCashCount(
  input: CashCountValues,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in to record a cash count.");
  if (!canPerform(user.role, "cash.count")) {
    return actionError("Only custodians and administrators can record counts.");
  }

  const parsed = cashCountSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const { fund_id, counted, note } = parsed.data;
  const supabase = await createClient();

  const { data: balance, error: balanceError } = await supabase
    .from("fund_balance_v")
    .select("expected_cash")
    .eq("fund_id", fund_id)
    .maybeSingle();

  if (balanceError) return actionError(balanceError.message);
  if (!balance) return actionError("Fund not found.");

  const countedCentavos = parseMoney(counted);
  const expectedCentavos = Math.round(
    Number(balance.expected_cash ?? 0) * 100,
  );

  if (countedCentavos !== expectedCentavos && !note) {
    return actionError(
      "A note is required when the counted cash differs from expected cash.",
      { note: ["Explain the difference between counted and expected cash."] },
    );
  }

  const { error } = await supabase.rpc("record_cash_count", {
    p_fund_id: fund_id,
    p_counted: toMoneyNumber(counted),
    p_note: note || undefined,
  });

  if (error) return actionError(safeDbMessage(error));

  if (countedCentavos !== expectedCentavos) {
    queueNotification("cash_count.variance", () =>
      notifyCashCountVariance({
        fundId: fund_id,
        countedCentavos: countedCentavos ?? 0,
        expectedCentavos,
        note: note || null,
        actorId: user.id,
      }),
    );
  }

  revalidatePath("/pcf/cash-count");
  revalidatePath("/pcf");
  return { ok: true };
}
