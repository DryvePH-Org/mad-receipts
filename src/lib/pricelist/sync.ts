import { stateFromLegacy, stateFromStockNote } from "@/lib/cars/state";
import type { SyncField } from "./import";

// Settling one row of the data check: which Docs Bible column a field is, which stock column keeps the Car status's own wording,
// and what each choice does. Pure; sync-server.ts does the saving.

export const DOCS_COLUMN: Partial<Record<SyncField, string>> = {
  arrival_date: "arrival_date", model: "model_variant", color: "color", mileage: "mileage", fuel: "fuel", encumbrance: "encumbrance",
  year: "year_model", brand: "make", trans: "trans", spare_key: "spare_key", docs_code: "papers_with",
  or_expiry: "renewal", // the typed date: the database turns it into the real date (or_expiry) by itself
};
/** The stock column that holds what the price list showed, for the fields that have one. */
export const OVERRIDE_COLUMN: Partial<Record<SyncField, string>> = {
  arrival_date: "list_arrived_on", model: "list_model", color: "list_color", mileage: "list_mileage", fuel: "list_fuel", encumbrance: "list_encumbrance",
};

export type Choice = "list" | "docs" | "noted" | "add" | "plate";
/** A code with nothing to compare it with (or an odd value) can only be noted; two different codes can be chosen between. */
export const choicesFor = (field: SyncField, hasRecordValue = true): Choice[] => (field === "unmatched" ? ["add", "plate", "noted"] : field === "odd_value" || (field === "docs_code" && !hasRecordValue) ? ["noted"] : ["list", "docs", "noted"]);

export interface SettlePlan { decision: string; docsPatch?: Record<string, string | null>; clearOverride?: string; /** a car that is only on the price list: make its Docs Bible row from Car status row */ addUnit?: boolean; /** ...or link its price list row to this plate, which is already in MAD */ linkPlate?: string }

const yy = (v: string) => { const d = v.replace(/\D/g, ""); return d.length >= 2 ? d.slice(-2) : d; };

export function planSettle(field: SyncField, choice: Choice, item: { listValue: string | null; docsValue: string | null }, input: { plate?: string } = {}): SettlePlan | { error: string } {
  if (!choicesFor(field, !!item.docsValue).includes(choice)) return { error: "That choice is not available for this item." };
  if (choice === "noted") return { decision: field === "unmatched" ? "Left out: not a car of MAD" : "Noted, left as it is" };
  if (choice === "add") return { decision: "The car was added to MAD from Car status", addUnit: true };
  if (choice === "plate") {
    const plate = (input.plate ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return plate.length >= 5 ? { decision: `Linked to the car with plate ${plate}`, linkPlate: plate } : { error: "Type the whole plate number." };
  }
  const override = OVERRIDE_COLUMN[field];
  if (field === "status") {
    // an old item (before the one status): choosing a side sets the car's state to what that side said
    const side = choice === "list" ? stateFromStockNote(item.listValue, null, "2026-01-01").state : stateFromLegacy(...(String(item.docsValue ?? "").split(" / ") as [string, string]));
    if (!side) return { error: "That side has no state to copy." };
    return { decision: `The car's state is now ${side}`, docsPatch: { stock_state: side } };
  }
  const column = DOCS_COLUMN[field];
  if (!column) return { error: "That field cannot be settled here." };
  if (choice === "docs") return { decision: "The car record's value was kept; Car status shows it too", ...(override ? { clearOverride: override } : {}) };
  if (!item.listValue) return { error: "Car status has no value to copy." };
  return { decision: "Car status's value was copied into the car record", docsPatch: { [column]: field === "year" ? yy(item.listValue) : item.listValue }, ...(override ? { clearOverride: override } : {}) };
}
