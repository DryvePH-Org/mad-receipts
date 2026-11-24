import { describe, expect, it } from "vitest";
import { SALE_FIELD_NAME, SALE_SECTIONS } from "@/lib/sales/sections";
import { FIELD_NAME } from "@/lib/cars/sections";

describe("one sale record, the same sections and names everywhere", () => {
  it("puts every box in exactly one section and names it once", () => {
    const all = SALE_SECTIONS.flatMap((s) => s.keys);
    expect(new Set(all).size).toBe(all.length);
    for (const k of all) expect(SALE_FIELD_NAME[k], k).toBeTruthy();
    const names = Object.values(SALE_FIELD_NAME);
    expect(new Set(names).size).toBe(names.length);
  });
  it("uses no name that the car record already uses for something else", () => {
    const car = new Set(Object.values(FIELD_NAME));
    for (const [k, n] of Object.entries(SALE_FIELD_NAME)) expect(car.has(n), `${k}: ${n}`).toBe(false);
  });
});
