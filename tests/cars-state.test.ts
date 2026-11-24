import { describe, expect, it } from "vitest";
import { dateOfMonthDay, deriveState, remarksText, stateFromLegacy, stateFromStockNote, statusText } from "@/lib/cars/state";

describe("one status per car", () => {
  it("reads the two old columns", () => {
    expect(stateFromLegacy("Sold", "SOLD")).toBe("Sold");
    expect(stateFromLegacy("Onhand", "SHIPPED TO CEB")).toBe("Shipped to Cebu");
    expect(stateFromLegacy("Onhand", "AVAILABLE")).toBe("Onhand");
    expect(stateFromLegacy(null, null)).toBeNull();
  });
  it("reads the price list's note and repair state", () => {
    expect(stateFromStockNote("RESERVED - SWEET 10/14 | battery on order", null, "2026-11-19")).toMatchObject({ state: "Reserved", who: "SWEET", on: "2026-10-14", note: "battery on order" });
    expect(stateFromStockNote("FOR REPAIR - 48V BATTERY", null, "2026-11-19")).toMatchObject({ state: "For repair" });
    expect(stateFromStockNote("", "SELL AS IS", "2026-11-19").state).toBe("Sell as is");
    expect(stateFromStockNote("just a note", null, "2026-11-19")).toMatchObject({ state: null, note: "just a note" });
  });
  it("puts a month and day in the right year", () => {
    expect(dateOfMonthDay("11/14", "2026-11-19")).toBe("2026-11-14");
    expect(dateOfMonthDay("12/30", "2026-01-05")).toBe("2025-12-30"); // far ahead: it was last year
    expect(dateOfMonthDay("13/40", "2026-11-19")).toBeNull();
  });
  it("makes the old REMARKS text from the one state", () => {
    expect(statusText("Reserved", "DAVID", "2026-11-02")).toBe("RESERVED - DAVID 11/2");
    expect(statusText("Onhand", null, null)).toBe("");
    expect(statusText("Sold", "DAVID 3% ELLA 1.5%", "2026-11-02")).toBe("SOLD - DAVID 3% ELLA 1.5% 11/2"); // the commission stays
    expect(stateFromStockNote("SOLD - DAVID 3% ELLA 1.5% 11/2", null, "2026-11-19").who).toBe("DAVID 3% ELLA 1.5%");
    expect(remarksText("Sold", "DAVID ELLA", "2026-11-02", "paid in full")).toBe("SOLD - DAVID ELLA 11/2 | paid in full");
    expect(remarksText("Onhand", null, null, "a note")).toBe("a note");
  });
  describe("the one state of a car that had two sources", () => {
    const base = { remarks: null, repair: null, sale: "Onhand", vehicle: "AVAILABLE", today: "2026-11-19" };
    it("takes the price list's Reserved note and says when the Docs Bible disagreed", () => {
      const d = deriveState({ ...base, inStock: true, remarks: "RESERVED - ELLA 11/14" });
      expect(d).toMatchObject({ state: "Reserved", who: "ELLA", on: "2026-11-14" });
      expect(d.conflict).toContain("Docs Bible said Onhand");
    });
    it("takes the Docs Bible's state for a car not on the price list", () => {
      expect(deriveState({ ...base, inStock: false, sale: "Sold", vehicle: "SOLD" })).toMatchObject({ state: "Sold", conflict: null });
    });
    it("flags a car the Docs Bible calls Sold that is still on the price list with no status note", () => {
      const d = deriveState({ ...base, inStock: true, sale: "Sold", vehicle: "SOLD" });
      expect(d.state).toBe("Sold");
      expect(d.conflict).toContain("still on the price list");
    });
    it("is Onhand when nothing says otherwise, and repair states win over Onhand", () => {
      expect(deriveState({ ...base, inStock: true }).state).toBe("Onhand");
      expect(deriveState({ ...base, inStock: true, repair: "FOR REPAIR" })).toMatchObject({ state: "For repair", conflict: null });
    });
  });
});
