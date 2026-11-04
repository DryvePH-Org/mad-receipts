"use server";

import { requireUser } from "@/lib/auth";
import { inventory, inventoryErrorMessage, type InventoryUnit } from "@/lib/inventory";
import { toCentavos } from "@/lib/rules/money";
import type { TransactionType } from "@/lib/rules/terms";
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
  /** How the deal is paid, as saved. Money in centavos. */
  terms: {
    type: TransactionType;
    loan: number;
    fee: number;
    tradeIn: number;
    financier: string;
    tradeInDetails: string;
  };
  /** Who is credited with the deal so far, with each person's own commission percent. */
  salespeople: { salespersonId: string; name: string; percent: number }[];
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
        "id, buyer_name, buyer_address, buyer_contact, make_type, color, motor_no, chassis_no, agreed_price, total_paid, transaction_type, loan_amount, processing_fee, trade_in_value, financier, trade_in_details, receipts(count), deal_salespeople(salesperson_id, commission_percent, salespeople(name))",
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
    terms: {
      type: (["cash", "financing", "trade_in"].includes(row.transaction_type) ? row.transaction_type : "cash") as TransactionType,
      loan: toCentavos(row.loan_amount) ?? 0,
      fee: toCentavos(row.processing_fee) ?? 0,
      tradeIn: toCentavos(row.trade_in_value) ?? 0,
      financier: row.financier ?? "",
      tradeInDetails: row.trade_in_details ?? "",
    },
    salespeople: row.deal_salespeople.map((p) => ({
      salespersonId: p.salesperson_id,
      name: p.salespeople?.name ?? "",
      percent: Number(p.commission_percent),
    })),
  };

  return { ok: true, plate, unit: unitResult.value, deal };
}
