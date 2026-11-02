"use server";

import { requireUser } from "@/lib/auth";
import { inventory, inventoryErrorMessage, type InventoryUnit } from "@/lib/inventory";
import { toCentavos } from "@/lib/rules/money";
import { normalizePlate } from "@/lib/rules/validate";
import { createClient } from "@/lib/supabase/server";

export interface OpenDeal {
  id: string;
  buyer_name: string;
  buyer_address: string | null;
  buyer_contact: string | null;
  make_type: string | null;
  color: string | null;
  motor_no: string | null;
  chassis_no: string | null;
  /** Centavos. */
  agreedPrice: number;
  totalPaid: number;
  confirmedReceipts: number;
}

export type PlateLookup =
  | { ok: true; plate: string; unit: InventoryUnit | null; deal: OpenDeal | null }
  | { ok: false; plate: string; error: string };

/** For the review screen: the plate's inventory unit and its open deal, if any. */
export async function lookupPlate(rawPlate: string): Promise<PlateLookup> {
  await requireUser();
  const plate = normalizePlate(rawPlate);
  if (!plate) return { ok: true, plate, unit: null, deal: null };

  const supabase = await createClient();
  const [unitResult, dealResult] = await Promise.allSettled([
    inventory.getUnit(plate),
    supabase
      .from("deals")
      .select(
        "id, buyer_name, buyer_address, buyer_contact, make_type, color, motor_no, chassis_no, agreed_price, total_paid, receipts(count)",
      )
      .eq("plate_no", plate)
      .eq("status", "open")
      .eq("receipts.status", "confirmed")
      .maybeSingle(),
  ]);

  if (unitResult.status === "rejected") {
    return { ok: false, plate, error: inventoryErrorMessage(unitResult.reason) };
  }
  if (dealResult.status === "rejected" || dealResult.value.error) {
    return { ok: false, plate, error: "Couldn't look up existing deals right now. Try again in a moment." };
  }

  const row = dealResult.value.data;
  const deal: OpenDeal | null = row && {
    id: row.id,
    buyer_name: row.buyer_name,
    buyer_address: row.buyer_address,
    buyer_contact: row.buyer_contact,
    make_type: row.make_type,
    color: row.color,
    motor_no: row.motor_no,
    chassis_no: row.chassis_no,
    agreedPrice: toCentavos(row.agreed_price) ?? 0,
    totalPaid: toCentavos(row.total_paid) ?? 0,
    confirmedReceipts: row.receipts[0]?.count ?? 0,
  };

  return { ok: true, plate, unit: unitResult.value, deal };
}
