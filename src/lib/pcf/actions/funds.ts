"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { safeDbMessage } from "@/lib/pcf/db-error";
import { actionError, type ActionResult } from "@/lib/pcf/action-result";
import { getAdminUser } from "@/lib/pcf/auth";
import { parseMoney, toMoneyNumber } from "@/lib/pcf/money";
import { queueNotification } from "@/lib/pcf/notifications/deliver";
import { notifyFundAssignment } from "@/lib/pcf/notifications/events";
import { createClient } from "@/lib/supabase/server";
import { saveFundSchema, type SaveFundInput } from "@/lib/pcf/validators/fund";

function validationError(error: z.ZodError): ActionResult {
  const fieldErrors = z.flattenError(error).fieldErrors as Record<
    string,
    string[]
  >;
  return actionError("Check the highlighted fields.", fieldErrors);
}

export async function saveFund(input: SaveFundInput): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) {
    return actionError("Only administrators can change fund settings.");
  }

  const parsed = saveFundSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const { id, confirmAmountChange, custodian_ids, ...values } = parsed.data;
  const wanted = [...new Set(custodian_ids)];
  const payload = {
    name: values.name,
    amount: toMoneyNumber(values.amount),
    per_txn_limit: toMoneyNumber(values.per_txn_limit),
    approval_threshold: toMoneyNumber(values.approval_threshold),
    low_balance_pct: values.low_balance_pct,
  };

  const supabase = await createClient();
  let previous: string[] = [];
  let fundId = id;

  if (id) {
    const { data: current, error: readError } = await supabase
      .from("funds")
      .select("amount")
      .eq("id", id)
      .maybeSingle();

    if (readError) return actionError(safeDbMessage(readError));
    if (!current) return actionError("Fund not found.");

    const { data: links, error: linkError } = await supabase
      .from("fund_custodians")
      .select("custodian_id")
      .eq("fund_id", id);
    if (linkError) return actionError(safeDbMessage(linkError));
    previous = links.map((link) => link.custodian_id);

    const amountChanged =
      parseMoney(String(current.amount)) !== parseMoney(values.amount);
    if (amountChanged && !confirmAmountChange) {
      return actionError(
        "Confirm the fund amount change before saving. It recalculates expected cash.",
      );
    }

    const { error } = await supabase.from("funds").update(payload).eq("id", id);
    if (error) return actionError(safeDbMessage(error));
  } else {
    const { data: created, error } = await supabase
      .from("funds")
      .insert(payload)
      .select("id")
      .single();
    if (error) return actionError(safeDbMessage(error));
    fundId = created.id;
  }

  const { error: custodianError } = await supabase.rpc("set_fund_custodians", {
    p_fund_id: fundId as string,
    p_custodian_ids: wanted,
  });
  if (custodianError) return actionError(safeDbMessage(custodianError));

  const fundName = payload.name;
  const added = wanted.filter((userId) => !previous.includes(userId));
  const removed = previous.filter((userId) => !wanted.includes(userId));
  for (const userId of added) {
    queueNotification("fund.assignment_changed", () =>
      notifyFundAssignment({ userId, added: [fundName], removed: [], actorId: admin.id }),
    );
  }
  for (const userId of removed) {
    queueNotification("fund.assignment_changed", () =>
      notifyFundAssignment({ userId, added: [], removed: [fundName], actorId: admin.id }),
    );
  }

  revalidatePath("/pcf/funds");
  return { ok: true };
}
