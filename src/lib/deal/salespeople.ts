import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** The first names (capitals) of everyone with the Sales role: the people a receipt can say sold the car. Live from the system. */
export async function salespeopleNames(): Promise<string[]> {
  const { data } = await createAdminClient().from("profiles").select("full_name").eq("role", "sales").limit(200);
  return [...new Set((data ?? []).map((p) => String(p.full_name ?? "").trim().split(/\s+/)[0]?.toUpperCase() ?? "").filter(Boolean))].sort();
}

/** The first name in capitals, the way the team writes it ("David Reyes" becomes "DAVID"). */
export const firstNameOf = (fullName: string | null | undefined): string => String(fullName ?? "").trim().split(/\s+/)[0]?.toUpperCase() ?? "";
