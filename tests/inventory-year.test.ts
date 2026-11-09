import { describe, expect, it } from "vitest";
import { fullYear, withYear } from "@/lib/inventory/year";

const now = new Date("2026-11-09T00:00:00Z");
describe("the year model from the inventory's YM column", () => {
  it("turns two digits into the full year", () => {
    expect(fullYear("26", now)).toBe("2026");
    expect(fullYear("17", now)).toBe("2017");
    expect(fullYear("15", now)).toBe("2015");
    expect(fullYear("27", now)).toBe("2027"); // a model one year ahead of the calendar
    expect(fullYear("98", now)).toBe("1998");
  });
  it("keeps four digits, and anything else as written", () => {
    expect(fullYear("2021", now)).toBe("2021");
    expect(fullYear(" 2021 ", now)).toBe("2021");
    expect(fullYear("", now)).toBe("");
    expect(fullYear(undefined, now)).toBe("");
    expect(fullYear("N/A", now)).toBe("N/A");
  });
  it("puts it first, as the receipt writes the car", () => {
    expect(withYear("26", "SUZUKI SPRESSO 1.0 AGS", now)).toBe("2026 SUZUKI SPRESSO 1.0 AGS");
    expect(withYear("2021", "2021 HONDA CIVIC", now)).toBe("2021 HONDA CIVIC"); // not twice
    expect(withYear(undefined, "HONDA CIVIC", now)).toBe("HONDA CIVIC");
    expect(withYear("26", undefined, now)).toBeUndefined();
    expect(withYear("N/A", "HONDA CIVIC", now)).toBe("HONDA CIVIC"); // not a year: not shown
  });
});
