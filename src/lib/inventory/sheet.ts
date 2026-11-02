import "server-only";
import type { InventoryAdapter } from "./types";

// The Google Sheet adapter is built in Phase 8.
export function createSheetInventory(): InventoryAdapter {
  const notReady = () => Promise.reject(new Error("Inventory sheet adapter is not built yet"));
  return { getUnit: notReady, setStatus: notReady };
}
