// The review list: what the staff must decide after the import (two arrivals of one plate, a row with no plate, two status columns that
// disagree, an old car with no classification, a date or plate that looks wrong). planResolution is pure; resolveReview does the saving.
import { CLASSIFICATIONS, dateOf, plateKey, plateLooksUsual } from "./normalize";

export type ReviewKind = "duplicate_plate" | "no_plate" | "status_disagree" | "legacy_classification" | "odd_date" | "odd_plate" | "unknown_value" | "other" | "pricelist_docs_code" | "pricelist_unmatched" | "pricelist_odd_value" | "pricelist_differs";
export const KIND_LABELS: Record<ReviewKind, string> = {
  duplicate_plate: "Same plate twice", no_plate: "Row without a plate", status_disagree: "Status differs", legacy_classification: "Needs a classification",
  odd_date: "Date to fix", odd_plate: "Plate to check", unknown_value: "Unknown value", other: "Other",
  pricelist_docs_code: "Price list: papers-with code", pricelist_unmatched: "Price list: car not in the Docs Bible", pricelist_odd_value: "Price list: odd value", pricelist_differs: "Price list differs from the Docs Bible",
};

export type ReviewAction =
  | { type: "keep" }                                          // leave it as it is (any kind): the decision is recorded
  | { type: "archive"; unitId: string }                       // duplicate: this row is a double entry
  | { type: "add_plate"; plate: string }                      // no plate: add the plate, the row becomes a car
  | { type: "use_status"; which: "sale" | "vehicle" }         // status: the one that is right is copied to the other
  | { type: "classify"; value: string }                       // legacy classification
  | { type: "set_date"; date: string }                        // odd date
  | { type: "set_plate"; plate: string };                     // odd plate

export interface UnitLite { id: string; plate_no: string; plate_display: string; arrival_date: string | null; sale_status: string | null; vehicle_status: string | null; classification: string }
export interface Resolution {
  decision: string;
  patch?: { unitId: string; fields: Record<string, string | null> };
  archive?: string;
  createFromRow?: { plate: string };
  /** nothing is saved except the review item itself */
  recordOnly?: boolean;
}

const SALE_TO_VEHICLE: Record<string, string> = { sold: "SOLD", onhand: "AVAILABLE", reserved: "AVAILABLE", "not for sale": "NOT FOR SALE" };
const VEHICLE_TO_SALE: Record<string, string> = { "SOLD": "Sold", "AVAILABLE": "Onhand", "SHIPPED TO CEB": "Onhand", "NOT FOR SALE": "Not For Sale" };

export function planResolution(kind: ReviewKind, unit: UnitLite | null, action: ReviewAction): Resolution | { error: string } {
  if (action.type === "keep") return { decision: "Left as it is", recordOnly: true };
  switch (action.type) {
    case "archive": return kind === "duplicate_plate" ? { decision: "Double entry: this row was removed (kept in the history)", archive: action.unitId } : { error: "Only a duplicate can be removed." };
    case "add_plate": {
      if (kind !== "no_plate") return { error: "This item is not a row without a plate." };
      const plate = plateKey(action.plate);
      return plate.length >= 4 ? { decision: `Plate ${plate} added: the row is now a car`, createFromRow: { plate } } : { error: "Type the plate number." };
    }
    case "use_status": {
      if (!unit || kind !== "status_disagree") return { error: "This item is not a status difference." };
      if (action.which === "sale") { const v = SALE_TO_VEHICLE[(unit.sale_status ?? "").toLowerCase()]; return v ? { decision: `STATUS (${unit.sale_status}) is right: VEHICLE STATUS set to ${v}`, patch: { unitId: unit.id, fields: { vehicle_status: v } } } : { error: "STATUS has no matching VEHICLE STATUS." }; }
      const s = VEHICLE_TO_SALE[(unit.vehicle_status ?? "").toUpperCase()]; return s ? { decision: `VEHICLE STATUS (${unit.vehicle_status}) is right: STATUS set to ${s}`, patch: { unitId: unit.id, fields: { sale_status: s } } } : { error: "VEHICLE STATUS has no matching STATUS." };
    }
    case "classify":
      return unit && kind === "legacy_classification" && (CLASSIFICATIONS as readonly string[]).includes(action.value) ? { decision: `Classified as ${action.value}`, patch: { unitId: unit.id, fields: { classification: action.value } } } : { error: "Choose Clean, Repo (bank) or Encumbered (Indiv)." };
    case "set_date": {
      const d = dateOf(action.date);
      return unit && kind === "odd_date" && d.value ? { decision: `Arrival date set to ${d.value}`, patch: { unitId: unit.id, fields: { arrival_date: d.value } } } : { error: "Type a real date, like 2026-07-10." };
    }
    case "set_plate": {
      const plate = plateKey(action.plate);
      if (!unit || kind !== "odd_plate" || plate.length < 3) return { error: "Type the plate number." };
      return { decision: `Plate corrected to ${plate}`, patch: { unitId: unit.id, fields: { plate_no: plate, plate_display: plate } } };
    }
  }
}

export { plateLooksUsual };
