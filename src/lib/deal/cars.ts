import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface RegisterCar { plate: string; year: string; makeType: string; color: string; status: "Available" | "Reserved" | "Sold" }

/**
 * Every car of MAD that is not on the sale list (sold before, or only in Car documents): a receipt can be made for any of them. The sale list's own cars
 * come from the inventory; these are the rest, so no car of Car documents is missing from the picker.
 */
export async function registerCarsOffTheList(onList: ReadonlySet<string>): Promise<RegisterCar[]> {
  const { data } = await (createAdminClient() as unknown as { from: (t: string) => { select: (c: string) => { limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null }> } } })
    .from("docs_units_current").select("plate_no, year_model, make, model_variant, color, stock_state").limit(6000);
  return (data ?? []).filter((u) => !onList.has(String(u.plate_no))).map((u) => ({
    plate: String(u.plate_no), year: String(u.year_model ?? ""), makeType: [u.make, u.model_variant].filter(Boolean).join(" "), color: String(u.color ?? ""),
    status: u.stock_state === "Sold" ? "Sold" : u.stock_state === "Reserved" ? "Reserved" : "Available",
  }));
}
