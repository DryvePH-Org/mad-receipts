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
  it("never overwrites a code staff typed, and says so", () => {
    const p = planPricelist(input({ current: { ...blank, docs: "L:CAMILA" } }));
    expect(p.changes.some((c) => c.field === "docs")).toBe(false);
    expect(p.notes.join(" ")).toMatch(/L:CAMILA/);
    expect(planPricelist(input({ current: { ...blank, docs: "C" } })).changes.some((c) => c.field === "docs")).toBe(false);
  });
  it("replaces the OR date only with a later one (a renewal), and keeps a later one already there", () => {
    expect(planPricelist(input({ current: { ...blank, orExp: "2026-02-01" } })).changes.find((c) => c.field === "or_exp")).toEqual({ field: "or_exp", before: "2026-02-01", after: "2027-02-01" });
    const later = planPricelist(input({ current: { ...blank, orExp: "2028-01-01" } }));
    expect(later.changes.some((c) => c.field === "or_exp")).toBe(false);
    expect(later.notes.join(" ")).toMatch(/later than the official receipt/);
    expect(planPricelist(input({ current: { ...blank, orExp: "2027-02-01" } })).changes.some((c) => c.field === "or_exp")).toBe(false);
    expect(planPricelist(input({ orValidUntil: null })).changes.some((c) => c.field === "or_exp")).toBe(false);
  });
  it("writes the spare key as the sheet already does, only when blank", () => {
    expect(planPricelist(input({ spareKey: "no" })).changes.find((c) => c.field === "sparekey")?.after).toBe("N/A");
    expect(planPricelist(input({ spareKey: "" })).changes.some((c) => c.field === "sparekey")).toBe(false);
    expect(planPricelist(input({ current: { ...blank, spareKey: "W/ SPARE KEY" } })).changes.some((c) => c.field === "sparekey")).toBe(false);
    const clash = planPricelist(input({ spareKey: "no", current: { ...blank, spareKey: "W/SPAREKEY" } }));
    expect(clash.changes.some((c) => c.field === "sparekey")).toBe(false);
    expect(clash.notes.join(" ")).toMatch(/SPAREKEY says/);
  });
  it("names the lender, with RELEASED only when a cancellation is on file, and keeps what is typed", () => {
    expect(encumbranceText("  jaccs   finance ", false)).toBe("JACCS FINANCE");
    expect(planPricelist(input({ released: false })).changes.find((c) => c.field === "encumbrance")?.after).toBe("EASTWEST BANK");
    const typed = planPricelist(input({ current: { ...blank, encumbrance: "EWB (RELEASED 08/2025)" } }));
    expect(typed.changes.some((c) => c.field === "encumbrance")).toBe(false);
    expect(typed.notes.join(" ")).toMatch(/EWB/);
    expect(planPricelist(input({ lender: null })).changes.some((c) => c.field === "encumbrance")).toBe(false);
  });
  it("has nothing to do when the sheet already agrees", () => {
    expect(planPricelist(input({ current: { docs: "C", orExp: "2027-02-01", spareKey: "W/SPAREKEY", encumbrance: "EASTWEST BANK - RELEASED" } })).changes).toEqual([]);
  });
});
