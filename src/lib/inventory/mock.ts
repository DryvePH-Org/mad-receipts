import { normalizePlate } from "@/lib/rules/validate";
import type { InventoryAdapter, InventoryUnit } from "./types";

/** In-memory inventory for tests (and local development until the sheet is configured). */
export function createMockInventory(units: InventoryUnit[] = []): InventoryAdapter & {
  units: Map<string, InventoryUnit>;
} {
  const map = new Map(units.map((u) => [normalizePlate(u.plate), { ...u }]));
  return {
    units: map,
    async getUnit(plate) {
      const unit = map.get(normalizePlate(plate));
      return unit ? { ...unit } : null;
    },
    async setStatus(plate, status) {
      const unit = map.get(normalizePlate(plate));
      if (!unit) throw new Error("Plate not found in inventory");
      unit.status = status;
    },
  };
}
