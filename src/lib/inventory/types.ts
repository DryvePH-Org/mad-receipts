// Status words written to the inventory sheet. They must match what staff type there.
// (Open item: confirm the exact words with the owner.)
export const UNIT_STATUS = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
} as const;

export type UnitStatus = (typeof UNIT_STATUS)[keyof typeof UNIT_STATUS];

export interface InventoryUnit {
  plate: string;
  /** As written in the sheet; staff may type anything there. */
  status: string;
  makeType?: string;
  color?: string;
}

export interface InventoryAdapter {
  getUnit(plate: string): Promise<InventoryUnit | null>;
  setStatus(plate: string, status: UnitStatus, ref: { receiptNo: string }): Promise<void>;
}
