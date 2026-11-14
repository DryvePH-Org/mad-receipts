import { describe, expect, it } from "vitest";
import { encumbranceText, planPricelist, type PricelistInput } from "@/lib/docs/pricelist";

const blank = { docs: "", orExp: null as string | null, spareKey: "", encumbrance: "" };
const input = (over: Partial<PricelistInput> = {}): PricelistInput => ({ docsComplete: true, orValidUntil: "2027-02-01", spareKey: "yes", lender: "EastWest Bank", released: true, current: blank, ...over });

describe("what the documents add to the pricelist", () => {
  it("fills the four blank cells", () => {
    expect(planPricelist(input()).changes).toEqual([
      { field: "docs", before: "", after: "C" }, { field: "or_exp", before: "", after: "2027-02-01" },
      { field: "sparekey", before: "", after: "W/SPAREKEY" }, { field: "encumbrance", before: "", after: "EASTWEST BANK - RELEASED" },
    ]);
  });
  it("writes C only when the papers are complete", () => {
    expect(planPricelist(input({ docsComplete: false })).changes.some((c) => c.field === "docs")).toBe(false);
  });
  it("replaces a DOCS code staff typed when the papers are complete", () => {
    expect(planPricelist(input({ current: { ...blank, docs: "L:CAMILA" } })).changes.find((c) => c.field === "docs")).toEqual({ field: "docs", before: "L:CAMILA", after: "C" });
    expect(planPricelist(input({ current: { ...blank, docs: "C" } })).changes.some((c) => c.field === "docs")).toBe(false);
  });
  it("sets the OR date to the official receipt's, earlier or later", () => {
    expect(planPricelist(input({ current: { ...blank, orExp: "2026-02-01" } })).changes.find((c) => c.field === "or_exp")).toEqual({ field: "or_exp", before: "2026-02-01", after: "2027-02-01" });
    expect(planPricelist(input({ current: { ...blank, orExp: "2028-01-01" } })).changes.find((c) => c.field === "or_exp")).toEqual({ field: "or_exp", before: "2028-01-01", after: "2027-02-01" });
    expect(planPricelist(input({ current: { ...blank, orExp: "2027-02-01" } })).changes.some((c) => c.field === "or_exp")).toBe(false);
    expect(planPricelist(input({ orValidUntil: null })).changes.some((c) => c.field === "or_exp")).toBe(false);
  });
  it("sets the spare key as the staff answered, and leaves it when they did not answer", () => {
    expect(planPricelist(input({ spareKey: "no" })).changes.find((c) => c.field === "sparekey")?.after).toBe("N/A");
    expect(planPricelist(input({ spareKey: "" })).changes.some((c) => c.field === "sparekey")).toBe(false);
    expect(planPricelist(input({ current: { ...blank, spareKey: "W/ SPARE KEY" } })).changes.some((c) => c.field === "sparekey")).toBe(false); // the same thing written another way
    expect(planPricelist(input({ spareKey: "no", current: { ...blank, spareKey: "W/SPAREKEY" } })).changes.find((c) => c.field === "sparekey")).toEqual({ field: "sparekey", before: "W/SPAREKEY", after: "N/A" });
  });
  it("names the lender, with RELEASED only when a cancellation is on file, replacing what is there", () => {
    expect(encumbranceText("  jaccs   finance ", false)).toBe("JACCS FINANCE");
    expect(planPricelist(input({ released: false })).changes.find((c) => c.field === "encumbrance")?.after).toBe("EASTWEST BANK");
    expect(planPricelist(input({ current: { ...blank, encumbrance: "EWB (RELEASED 08/2025)" } })).changes.find((c) => c.field === "encumbrance")).toMatchObject({ before: "EWB (RELEASED 08/2025)", after: "EASTWEST BANK - RELEASED" });
    expect(planPricelist(input({ lender: null })).changes.some((c) => c.field === "encumbrance")).toBe(false);
  });
  it("has nothing to do when the sheet already agrees", () => {
    expect(planPricelist(input({ current: { docs: "C", orExp: "2027-02-01", spareKey: "W/SPAREKEY", encumbrance: "EASTWEST BANK - RELEASED" } })).changes).toEqual([]);
  });
});
