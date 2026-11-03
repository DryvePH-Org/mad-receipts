// The app's unit statuses. In the inventory sheet they are written as text in the REMARKS
// cell, e.g. "RESERVED - DAVID 11/2 10%" (see remarks.ts).
export const UNIT_STATUS = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
} as const;

export type UnitStatus = (typeof UNIT_STATUS)[keyof typeof UNIT_STATUS];

export interface InventoryUnit {
  plate: string;
  /** Reserved or Sold when the sheet's remarks say so, otherwise Available. */
  status: UnitStatus;
  /** The sheet's note for the unit, as written (may hold other notes like "FOR REPAIR"). */
  remarks?: string;
  makeType?: string;
  color?: string;
}

/** What gets written into the sheet with a status. */
export interface StatusRef {
  receiptNo: string;
  /** The salesperson shown in the sheet, e.g. "David". */
  salesperson: string;
  /** Whole percent of the agreed price paid so far (100 only when fully paid). */
  percentPaid: number;
  /** Month/day as staff write it in the sheet, e.g. "11/2". */
  date: string;
}

export interface InventoryAdapter {
  getUnit(plate: string): Promise<InventoryUnit | null>;
  setStatus(plate: string, status: UnitStatus, ref: StatusRef): Promise<void>;
}
