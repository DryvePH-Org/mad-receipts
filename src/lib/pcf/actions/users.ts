"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { safeDbMessage } from "@/lib/pcf/db-error";
import { actionError, type ActionResult } from "@/lib/pcf/action-result";
import { getAdminUser } from "@/lib/pcf/auth";
import { queueNotification } from "@/lib/pcf/notifications/deliver";
import { notifyFundAssignment } from "@/lib/pcf/notifications/events";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Accounts, passwords and petty cash roles are managed on MAD's Users page (src/app/(app)/admin/users).
// This file keeps the one petty cash user action: which funds a custodian holds.

function validationError(error: z.ZodError): ActionResult {
  return actionError(
    "Check the highlighted fields.",
    z.flattenError(error).fieldErrors as Record<string, string[]>,
  );
}

const setCustodianFundsSchema = z.object({
  userId: z.string().uuid(),
  fundIds: z.array(z.string().uuid()).max(200),
});

export async function setCustodianFunds(input: {
  userId: string;
  fundIds: string[];
}): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) return actionError("Only administrators can assign funds.");

  const parsed = setCustodianFundsSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { userId } = parsed.data;
  const fundIds = [...new Set(parsed.data.fundIds)];

  // Remember what this custodian held, so the change can be reported.
  const { data: funds, error: readError } = await createAdminClient()
    .from("funds")
    .select("id, name");
  if (readError) return actionError(safeDbMessage(readError));
  const { data: held, error: heldError } = await createAdminClient()
    .from("fund_custodians")
    .select("fund_id")
    .eq("custodian_id", userId);
  if (heldError) return actionError(safeDbMessage(heldError));
  const heldBefore = new Set(held.map((row) => row.fund_id));

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_custodian_funds", {
    p_user_id: userId,
    p_fund_ids: fundIds,
  });
  if (error) return actionError(safeDbMessage(error));

  const selected = new Set(fundIds);
  const added = funds.filter((fund) => selected.has(fund.id) && !heldBefore.has(fund.id));
  const removed = funds.filter((fund) => !selected.has(fund.id) && heldBefore.has(fund.id));

  if (added.length > 0 || removed.length > 0) {
    queueNotification("fund.assignment_changed", () =>
      notifyFundAssignment({
        userId,
        added: added.map((fund) => fund.name),
        removed: removed.map((fund) => fund.name),
        actorId: admin.id,
      }),
    );
  }

  revalidatePath("/admin/users");
  revalidatePath("/pcf/funds");
  return { ok: true };
}
