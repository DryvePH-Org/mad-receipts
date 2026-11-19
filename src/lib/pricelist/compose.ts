import { cleanDetails } from "@/lib/docs/details";
import type { DetailRow, PriceRow } from "./export";

// One price list row = the stock row (prices, location, notes, and what the price list itself showed differently) + the car's Docs Bible row
// + its About-the-car answers. Shared by the loader (the database) and the verify script, so what is checked is what is shown.

export interface StockRecord {
  unit_id: string; plate_no: string; body_group: string | null; sort_order: number | string;
  list_price: number | string | null; target_price: number | string | null; reprice: number | string | null; retarget: number | string | null;
  or_expiry: string | null; or_expiry_raw: string | null; papers_with: string | null; tools: string | null; location: string | null; repair_status: string | null; remarks: string | null;
  list_model: string | null; list_color: string | null; list_mileage: string | null; list_fuel: string | null; list_arrived_on: string | null; list_encumbrance: string | null;
}
export interface UnitRecord {
  id: string; plate_display: string | null; arrival_date: string | null; year_model: string | null; make: string | null; model_variant: string | null; color: string | null; mileage: string | null;
  trans: string | null; fuel: string | null; encumbrance: string | null; spare_key: string | null; classification: string | null;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function composeRow(s: StockRecord, u: UnitRecord, aboutRaw: unknown, complete: string | null): { price: PriceRow; detail: DetailRow } {
  const d = aboutRaw ? cleanDetails(aboutRaw) : null;
  // one spare key: the car's record (answering it on the car page writes the record). A stored checklist answer only fills in when the record has none.
  const spareKey = u.spare_key ?? (d?.spareKey === "yes" ? "W/SPAREKEY" : d?.spareKey === "no" ? "NO SPAREKEY" : null);
  const plate = u.plate_display || s.plate_no;
  return {
    price: {
      group: s.body_group, order: Number(s.sort_order), papersWith: s.papers_with, orExpiry: s.or_expiry, orExpiryRaw: s.or_expiry_raw, spareKey,
      // what the price list showed wins where it said something different (kept on the stock row); otherwise the Docs Bible row
      arrived: s.list_arrived_on ?? u.arrival_date, ym: u.year_model, brand: u.make, make: s.list_model ?? u.model_variant, color: s.list_color ?? u.color,
      mileage: s.list_mileage ?? u.mileage, trans: u.trans, fuel: s.list_fuel ?? u.fuel, plate,
      price: num(s.list_price), target: num(s.target_price), reprice: num(s.reprice), retarget: num(s.retarget), remarks: s.remarks,
      encumbrance: s.list_encumbrance ?? (/^N\/?A$/i.test(String(u.encumbrance ?? "").trim()) ? null : u.encumbrance), tools: s.tools, location: s.location, repairStatus: s.repair_status,
    },
    detail: {
      plate, car: [u.year_model, u.make, u.model_variant, u.color].filter(Boolean).join(" "), classification: u.classification, papersComplete: complete, spareKey,
      casaMaintained: d?.casaMaintained || null, casaWhen: d?.casaWhen || null, casaWhere: d?.casaWhere || null, batteryWhen: d?.batteryWhen || null, boughtFrom: d?.boughtFrom || null,
      isEv: !!d?.isEv, evCharger: d?.evCharger || null, evCard: d?.evCard || null, note: d?.note || null,
    },
  };
}
