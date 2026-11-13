import "server-only";
import { normalizePlate } from "@/lib/rules/plate";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Car } from "./car";
import { defaultDocsDeps, linkFolder, loadCar } from "./service";

/** What Sales is asked for: the buyer's ID, the signed deed and the signed AR. */
export interface SalesView {
  plate: string;
  display: string;
  carName: string;
  buyer: string;
  dealNo: string;
  location: "available" | "sold";
  needs: { key: string; label: string; present: boolean }[];
}

export const salesViewOf = (car: Car, buyer: string, dealNo: string): SalesView => ({
  plate: car.folder.plate_no, display: car.folder.plate_display, carName: car.folder.folder_name ?? car.folder.plate_display, buyer, dealNo, location: car.folder.location as "available" | "sold",
  needs: car.checklist.items.filter((i) => i.stage === "sold").map((i) => ({ key: i.key, label: i.label, present: i.present })),
});

export type LookupResult = { ok: true; view: SalesView } | { ok: false; message: string };

/**
 * The car for a plate, for Sales to confirm before uploading. Only a car that has an AR, so a photo can
 * never be filed under a plate nobody has sold. If the folder was not linked when the AR was made, it is tried again now.
 */
export async function lookupForSales(plateInput: string): Promise<LookupResult> {
  const plate = normalizePlate(plateInput);
  if (plate.length < 5) return { ok: false, message: "Type the whole plate number, like NKF 4771." };
  const admin = createAdminClient();
  const { data: unit } = await admin.from("deal_units").select("deal_id, plate_display").eq("plate_no", plate).eq("active", true).maybeSingle();
  if (!unit) return { ok: false, message: `No AR has been made for ${plateInput.trim().toUpperCase()} yet. Make the AR first, then upload its documents.` };
  const { data: deal } = await admin.from("deals").select("buyer_name, deal_no").eq("id", unit.deal_id).single();
  let car = await loadCar(plate);
  if (!car || car.folder.match_status !== "linked" || !car.folder.folder_id) {
    await linkFolder(unit.plate_display, unit.deal_id, defaultDocsDeps());
    car = await loadCar(plate);
  }
  if (!car || car.folder.match_status !== "linked" || !car.folder.folder_id) {
    return { ok: false, message: car?.folder.match_status === "several" ? "More than one folder in Drive has this plate. Ask Documentation to choose the right one." : "There is no folder in Drive for this plate yet. Ask Documentation to create it." };
  }
  return { ok: true, view: salesViewOf(car, deal?.buyer_name ?? "", deal?.deal_no ?? "") };
}
