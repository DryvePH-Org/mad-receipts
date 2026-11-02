// Status words written to the inventory sheet. They must match what staff type there.
// (Open item: confirm the exact words with the owner. The InventoryAdapter is added in Phase 8.)
export const UNIT_STATUS = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
} as const;

export type UnitStatus = (typeof UNIT_STATUS)[keyof typeof UNIT_STATUS];
