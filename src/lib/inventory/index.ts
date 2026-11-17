import "server-only";
import { createMockInventory } from "./mock";
import { createSheetInventory } from "./sheet";
import type { InventoryAdapter } from "./types";

export type { InventoryAdapter, InventoryUnit, UnitStatus } from "./types";
export { UNIT_STATUS } from "./types";
export { InventoryError } from "./sheet";

function pickInventory(): InventoryAdapter {
  if (process.env.INVENTORY_SHEET_ID) return createSheetInventory();

  if (process.env.NODE_ENV !== "production") {
    // Local development only, until INVENTORY_SHEET_ID is set. Never used in production.
    console.warn("[inventory] INVENTORY_SHEET_ID not set; using the development stand-in");
    return createMockInventory([
      { plate: "NKF4771", status: "Available", makeType: "2021 Honda Civic", color: "Black" },
      { plate: "ABC1234", status: "Available", makeType: "2019 Toyota Vios", color: "White" },
      { plate: "XYZ5678", status: "Sold", makeType: "2020 Mitsubishi Mirage", color: "Red" },
    ]);
  }

  // Fail closed: without the sheet, no plate can be confirmed.
  const missing = () => Promise.reject(new Error("INVENTORY_SHEET_ID is not configured"));
  return { getUnit: missing, listUnits: missing, setStatus: missing };
}

export const inventory: InventoryAdapter = pickInventory();
