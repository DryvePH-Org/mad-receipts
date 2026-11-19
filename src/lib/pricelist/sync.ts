import type { SyncField } from "./import";

// Settling one row of the price list check: which Docs Bible column a field is, which stock column keeps the price list's own wording,
// and what each choice does. Pure; sync-server.ts does the saving.

export const DOCS_COLUMN: Partial<Record<SyncField, string>> = {
  arrival_date: "arrival_date", model: "model_variant", color: "color", mileage: "mileage", fuel: "fuel", encumbrance: "encumbrance",
  year: "year_model", brand: "make", trans: "trans", spare_key: "spare_key",
};
/** The stock column that holds what the price list showed, for the fields that have one. */
export const OVERRIDE_COLUMN: Partial<Record<SyncField, string>> = {
  arrival_date: "list_arrived_on", model: "list_model", color: "list_color", mileage: "list_mileage", fuel: "list_fuel", encumbrance: "list_encumbrance",
};

export type Choice = "list" | "docs" | "noted";
export const choicesFor = (field: SyncField): Choice[] => (field === "docs_code" || field === "unmatched" || field === "odd_value" ? ["noted"] : ["list", "docs", "noted"]);

export interface SettlePlan { decision: string; docsPatch?: Record<string, string | null>; clearOverride?: string }

const yy = (v: string) => { const d = v.replace(/\D/g, ""); return d.length >= 2 ? d.slice(-2) : d; };

export function planSettle(field: SyncField, choice: Choice, item: { listValue: string | null; docsValue: string | null }): SettlePlan | { error: string } {
  if (!choicesFor(field).includes(choice)) return { error: "That choice is not available for this item." };
  if (choice === "noted") return { decision: "Noted, left as it is" };
  const override = OVERRIDE_COLUMN[field];
  if (field === "status") {
    if (choice === "docs") return { decision: "The Docs Bible's status was kept" };
    const listed = /^\s*SOLD\b/i.test(item.listValue ?? "") ? "Sold" : /^\s*RESERVED\b/i.test(item.listValue ?? "") ? "Reserved" : null;
    if (!listed) return { error: "The price list has no Reserved or Sold note to copy." };
    return { decision: `The Docs Bible now says ${listed}, like the price list`, docsPatch: { sale_status: listed, vehicle_status: listed === "Sold" ? "SOLD" : "AVAILABLE" } };
  }
  const column = DOCS_COLUMN[field];
  if (!column) return { error: "That field cannot be settled here." };
  if (choice === "docs") return { decision: "The Docs Bible's value was kept; the price list shows it too", ...(override ? { clearOverride: override } : {}) };
  if (!item.listValue) return { error: "The price list has no value to copy." };
  return { decision: "The price list's value was copied into the Docs Bible", docsPatch: { [column]: field === "year" ? yy(item.listValue) : item.listValue }, ...(override ? { clearOverride: override } : {}) };
}
