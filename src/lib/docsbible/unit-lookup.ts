import "server-only";
import { inventory } from "@/lib/inventory";
import { docsDb } from "./review-server";

/** What is known about a car for naming its Drive folder ("21 Toyota Vios (ABC1234)"): the inventory sheet first, else the Docs Bible row typed in Add a car. */
export async function unitForFolder(plate: string): Promise<{ makeType?: string; year?: string } | null> {
  const fromInventory = await inventory.getUnit(plate).catch(() => null);
  if (fromInventory?.makeType) return fromInventory;
  const { data } = await docsDb().from("docs_units_current").select("make, model_variant, year_model").eq("plate_no", plate.toUpperCase().replace(/[^A-Z0-9]/g, "")).maybeSingle();
  if (!data?.make) return fromInventory ?? null;
  return { makeType: [data.make, data.model_variant].filter(Boolean).join(" "), year: (data.year_model as string | null) ?? undefined };
}
