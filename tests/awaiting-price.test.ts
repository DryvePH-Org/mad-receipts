import { describe, expect, it } from "vitest";
import { awaitsPrice } from "@/lib/cars/awaiting";

describe("a new car waits for its price", () => {
  it("an available car with no price waits", () => {
    expect(awaitsPrice({ in_stock: true, stock_state: null, list_price: null, reprice: null })).toBe(true);
    expect(awaitsPrice({ in_stock: true, stock_state: "Onhand", list_price: 0, reprice: null })).toBe(true);
  });
  it("a priced car does not", () => {
    expect(awaitsPrice({ in_stock: true, stock_state: "Onhand", list_price: 458000, reprice: null })).toBe(false);
    expect(awaitsPrice({ in_stock: true, stock_state: "Onhand", list_price: null, reprice: "400000.00" })).toBe(false);
  });
  it("a car that is reserved, sold, for repair, not for sale or off the list is never held back", () => {
    for (const s of ["Reserved", "Sold", "For repair", "Sell as is", "Not for sale", "Shipped to Cebu"]) expect(awaitsPrice({ in_stock: true, stock_state: s, list_price: null, reprice: null }), s).toBe(false);
    expect(awaitsPrice({ in_stock: false, stock_state: null, list_price: null, reprice: null })).toBe(false);
  });
});
