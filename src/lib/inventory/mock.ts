import { normalizePlate } from "@/lib/rules/validate";
import type { InventoryAdapter, InventoryUnit, StatusRef, UnitStatus } from "./types";

/** In-memory inventory for tests (and local development until the sheet is configured). */
export function createMockInventory(units: InventoryUnit[] = []): InventoryAdapter & {
  units: Map<string, InventoryUnit>;
  /** Every status change, in order, for tests. */
  changes: { plate: string; status: UnitStatus; ref: StatusRef }[];
} {
  const changes: { plate: string; status: UnitStatus; ref: StatusRef }[] = [];
  const map = new Map(units.map((u) => [normalizePlate(u.plate), { ...u }]));
  return {
    units: map,
    changes,
    async getUnit(plate) {
      const unit = map.get(normalizePlate(plate));
      return unit ? { ...unit } : null;
    },
    async setStatus(plate, status, ref) {
      const unit = map.get(normalizePlate(plate));
      if (!unit) throw new Error("Plate not found in inventory");
      unit.status = status;
      changes.push({ plate: normalizePlate(plate), status, ref });
    },
  };
}
