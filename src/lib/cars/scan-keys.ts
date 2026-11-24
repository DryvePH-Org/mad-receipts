// Kept apart from the reader so the Add a car page can use the names without loading the server-only reader.
/** What the "Add a car" quick scan fills in. The photo is only read: nothing about it is stored. */
export const SCAN_KEYS = ["plate", "make", "model_variant", "year_model", "color", "body_type", "fuel", "mileage", "reg_owner_name", "encumbrance"] as const;
export type ScanKey = (typeof SCAN_KEYS)[number];
export const SCAN_LABEL: Record<ScanKey, string> = {
  plate: "Plate number", make: "Brand", model_variant: "Make", year_model: "Model (year)", color: "Color", body_type: "Body type",
  fuel: "Fuel", mileage: "Mileage", reg_owner_name: "Registered owner", encumbrance: "Encumbered to",
};
