import "server-only";
import { createDbInventory, InventoryError } from "./db";
import { createMockInventory } from "./mock";
import type { InventoryAdapter } from "./types";

export type { InventoryAdapter, InventoryUnit, UnitStatus } from "./types";
export { UNIT_STATUS } from "./types";
export { InventoryError };

// The price list lives in the app's own database. Outside production (local development and the browser tests) a small in-memory stand-in is used
// unless INVENTORY_USE_DB=yes, so a test never writes a status into the live price list.
function pickInventory(): InventoryAdapter {
  if (process.env.NODE_ENV === "production" || process.env.INVENTORY_USE_DB === "yes") return createDbInventory();
  console.warn("[inventory] development stand-in (set INVENTORY_USE_DB=yes to use the database)");
  return createMockInventory([
    { plate: "NKF4771", status: "Available", makeType: "2021 Honda Civic", color: "Black" },
    { plate: "ABC1234", status: "Available", makeType: "2019 Toyota Vios", color: "White" },
    { plate: "XYZ5678", status: "Sold", makeType: "2020 Mitsubishi Mirage", color: "Red" },
  ]);
}

export const inventory: InventoryAdapter = pickInventory();
