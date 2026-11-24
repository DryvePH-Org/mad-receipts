import { describe, expect, it } from "vitest";
import { COLUMNS } from "@/lib/docsbible/grid";
import { FIELD_NAME, inSectionOrder, SECTIONS, sectionOf } from "@/lib/cars/sections";

describe("one car, the same sections and names everywhere", () => {
  it("puts every box of the table in exactly one section and gives it one name", () => {
    const all = SECTIONS.flatMap((s) => s.keys);
    expect(new Set(all).size).toBe(all.length); // no box in two sections
    for (const c of COLUMNS) {
      expect(sectionOf(c.key), c.key).not.toBeNull();
      expect(FIELD_NAME[c.key], c.key).toBeTruthy();
      expect(c.name).toBe(FIELD_NAME[c.key]);
    }
  });
  it("names every box of every section", () => {
    for (const k of SECTIONS.flatMap((s) => s.keys)) expect(FIELD_NAME[k], k).toBeTruthy();
  });
  it("gives no two boxes the same name", () => {
    const names = Object.values(FIELD_NAME);
    expect(new Set(names).size).toBe(names.length);
  });
  it("orders the boxes by section and keeps the sheet name for the export", () => {
    const keys = inSectionOrder([{ key: "remarks" }, { key: "cr" }, { key: "make" }, { key: "reg_owner_name" }]).map((x) => x.key);
    expect(keys).toEqual(["make", "reg_owner_name", "cr", "remarks"]);
    expect(COLUMNS.find((c) => c.key === "make")!.label).toBe("MAKE");
  });
});
