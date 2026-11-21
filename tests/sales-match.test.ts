import { describe, expect, it } from "vitest";
import { dealSaleKey, salespersonOf, sameBuyer } from "@/lib/sales/match";

describe("the buyer of a deal and the buyer on a sale record", () => {
  it("are the same person when the names are typed in another order or with a middle name", () => {
    expect(sameBuyer("JUAN DELA CRUZ", "Juan P. Dela Cruz")).toBe(true);
    expect(sameBuyer("DELA CRUZ, JUAN", "juan dela cruz")).toBe(true);
    expect(sameBuyer("JAIME GARCIA CARINGAL", "Jaime Caringal")).toBe(true);
    expect(sameBuyer("MARIA", "MARIA")).toBe(true);
  });
  it("are different people otherwise, and an empty name matches nobody", () => {
    expect(sameBuyer("JUAN DELA CRUZ", "PEDRO DELA CRUZ")).toBe(false);
    expect(sameBuyer("ANA SANTOS", "ANA REYES")).toBe(false);
    expect(sameBuyer("", "JUAN DELA CRUZ")).toBe(false);
    expect(sameBuyer(null, null)).toBe(false);
  });
});

describe("the sales person and the key", () => {
  it("writes the first name in capitals, as the sold list does", () => {
    expect(salespersonOf("David Reyes")).toBe("DAVID");
    expect(salespersonOf("  ella ")).toBe("ELLA");
    expect(salespersonOf("")).toBeNull();
    expect(salespersonOf(null)).toBeNull();
  });
  it("makes one record per deal and plate", () => {
    expect(dealSaleKey("abc", "NBW8246")).toBe("deal|abc|NBW8246");
  });
});
