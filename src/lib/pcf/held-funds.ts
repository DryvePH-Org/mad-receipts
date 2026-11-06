import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** The funds a person is custodian of. They must be handed to someone else before the person stops being a custodian. */
export async function heldFunds(userId: string): Promise<{ id: string; name: string }[]> {
  const admin = createAdminClient();
  const { data: links, error } = await admin
    .from("fund_custodians")
    .select("fund_id")
    .eq("custodian_id", userId);
  if (error) throw error;
  if (links.length === 0) return [];
  const { data, error: fundsError } = await admin
    .from("funds")
    .select("id, name")
    .in("id", links.map((link) => link.fund_id));
  if (fundsError) throw fundsError;
  return data;
}

export function heldFundsMessage(names: string[]) {
  return `This custodian still holds ${names.join(", ")}. Reassign ${names.length === 1 ? "that fund" : "those funds"} first.`;
}
