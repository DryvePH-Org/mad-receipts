import { describe, expect, it } from "vitest";
import { errorCells, findHeaders, INVENTORY_HEADERS } from "@/lib/golive/headers";

describe("checking that a sheet still has the columns we rely on", () => {
  const rows = [["F", "1"], ["PLATE NUMBER", "YM", "", "COLOR", "PRICE", "REMARKS"], ["NKU8411", "21", "", "WHITE", "578000", ""]];
  it("finds the header row wherever it is and lists what is missing", () => {
    expect(findHeaders(rows, ["PLATE NUMBER", "YM", "COLOR", "BRAND"])).toEqual({ rowIndex: 1, missing: ["BRAND"], found: 3 });
    expect(findHeaders(rows, ["PLATE NUMBER", "PRICE"])).toMatchObject({ rowIndex: 1, missing: [] });
  });
  it("ignores spacing, case and punctuation in the header text", () => {
    expect(findHeaders([["plate  number", "Seller's ID"]], ["PLATE NUMBER", "SELLER'S ID"]).missing).toEqual([]);
  });
  it("says everything is missing when no row looks like the header", () => {
    expect(findHeaders([["x", "y"]], INVENTORY_HEADERS)).toMatchObject({ rowIndex: -1, found: 0 });
  });
  it("counts the cells showing a Google error", () => {
    expect(errorCells([["ok", "#REF!"], ["#N/A", "fine", "#VALUE!"]])).toBe(3);
    expect(errorCells([["a#REF!b"]])).toBe(0);
  });
});
