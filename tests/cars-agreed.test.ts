import { describe, expect, it } from "vitest";
import { carRowOf, type CarFacts, type StockFacts } from "@/lib/cars/from-db";
import { agreedLabel, forRole } from "@/lib/cars/model";

const stock = (o: Partial<StockFacts> = {}): StockFacts => ({ plate_no: "NBU4875", body_group: "HATCHBACK", list_price: 238000, target_price: 225000, reprice: null, retarget: null, or_expiry: null, papers_with: "C", tools: null, location: "ROSE MARY", repair_status: null, remarks: null, ...o });
const car = (o: Partial<CarFacts> = {}): CarFacts => ({ plate_display: "NBU4875", arrival_date: "2026-09-11", year_model: "17", make: "TOYOTA", model_variant: "WIGO 1.0G E MT", color: "RED", mileage: "108,000 KM", trans: "MT", fuel: "GAS", encumbrance: null, spare_key: null, body_type: null, or_expiry: null, ...o });

describe("the agreed price as a text", () => {
  it("an amount gets the peso sign and commas; other words are shown as written", () => {
    expect([agreedLabel("471000"), agreedLabel("471,000"), agreedLabel("₱ 471,000"), agreedLabel("PHP 600000.50"), agreedLabel(449000)]).toEqual(["₱471,000", "₱471,000", "₱471,000", "₱600,000.5", "₱449,000"]);
    expect(agreedLabel("600,000 plus the fee")).toBe("600,000 plus the fee");
    expect(agreedLabel("TBC")).toBe("TBC");
    expect([agreedLabel(""), agreedLabel(null), agreedLabel(undefined), agreedLabel("   ")]).toEqual(["", "", "", ""]);
  });
  it("Car Inventory shows the car's own agreed price, else the amount of its sale, for a reserved or sold car only", () => {
    const sold = { stock_state: "Sold" as const, state_for: "DAVID", state_on: "2026-11-02" };
    expect(carRowOf(stock({ agreed_price: "476,000" }), car(sold), "2026-11-26").agreedPrice).toBe("₱476,000");
    expect(carRowOf(stock({ agreed_price: "600,000 plus the fee" }), car(sold), "2026-11-26").agreedPrice).toBe("600,000 plus the fee");
    expect(carRowOf(stock(), car(sold), "2026-11-26", { agreedPrice: 449000 }).agreedPrice).toBe("₱449,000"); // from the sale record
    expect(carRowOf(stock({ agreed_price: "471,000" }), car(sold), "2026-11-26", { agreedPrice: 449000 }).agreedPrice).toBe("₱471,000"); // the car's own wins
    expect(carRowOf(stock({ agreed_price: "471,000" }), car(), "2026-11-26").agreedPrice).toBeNull(); // an available car has no agreed price
  });
  it("the edit form starts with the text, or with the amount of the sale; Online Marketing never see it", () => {
    const sold = { stock_state: "Sold" as const, state_for: "DAVID", state_on: "2026-11-02" };
    expect(carRowOf(stock({ agreed_price: "476,000 cash" }), car(sold), "2026-11-26").raw?.agreedPrice).toBe("476,000 cash");
    expect(carRowOf(stock(), car(sold), "2026-11-26", { agreedPrice: 449000 }).raw?.agreedPrice).toBe("449,000");
    const row = carRowOf(stock({ agreed_price: "476,000" }), car(sold), "2026-11-26");
    expect([forRole(row, "sales").agreedPrice, forRole(row, "marketing").agreedPrice]).toEqual(["₱476,000", null]);
  });
});
