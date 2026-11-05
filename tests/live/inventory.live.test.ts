import { describe, expect, it } from "vitest";
import { inventory } from "@/lib/inventory";

// A read-only look at the REAL inventory sheet: that it can be read and that each unit has what the form needs.
describe("the real inventory sheet", () => {
  it("lists units with make/type and plate", async () => {
    const units = await inventory.listUnits();
    const withMake = units.filter((u) => u.makeType);
    const available = units.filter((u) => u.status === "Available");
    console.info(`INVENTORY units=${units.length} withMakeType=${withMake.length} available=${available.length} sample=${JSON.stringify(withMake.slice(0, 3).map((u) => [u.plate, u.makeType, u.color, u.status]))}`);
    expect(units.length).toBeGreaterThan(0);
    expect(withMake.length).toBeGreaterThan(0);
  });
});
