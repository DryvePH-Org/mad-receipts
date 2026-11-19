import { describe, expect, it } from "vitest";
import { carRowOf, noteOf, type CarFacts, type StockFacts } from "@/lib/cars/from-db";
import { forRole } from "@/lib/cars/model";

const stock = (o: Partial<StockFacts> = {}): StockFacts => ({ plate_no: "NBU4875", body_group: "HATCHBACK", list_price: 238000, target_price: 225000, reprice: 228000, retarget: 215000, or_expiry: null, papers_with: "C", tools: null, location: "ROSE MARY", repair_status: null, remarks: null, list_model: null, list_color: null, list_mileage: null, list_fuel: null, list_arrived_on: null, list_encumbrance: null, ...o });
const car = (o: Partial<CarFacts> = {}): CarFacts => ({ plate_display: "NBU4875", arrival_date: "2026-09-11", year_model: "17", make: "TOYOTA", model_variant: "WIGO 1.0G E MT", color: "RED", mileage: "108T KMS", trans: "MT", fuel: "GAS", encumbrance: "N/A", spare_key: null, body_type: null, or_expiry: "2027-05-15", ...o });

describe("a Car status row from the database", () => {
  it("quotes the repriced price and knows it was repriced", () => {
    const c = carRowOf(stock(), car(), "2026-11-19");
    expect(c).toMatchObject({ plate: "NBU4875", year: "2017", brand: "TOYOTA", make: "WIGO 1.0G E MT", price: 228000, originalPrice: 238000, repriced: true, target: 215000, bodyType: "HATCHBACK", orExp: "2027-05-15", docsCode: "C", availability: "available", sellable: true });
    expect(c.daysInStock).toBe(69);
  });
  it("shows what the price list said where it differs from the car's record, and the arrival it kept", () => {
    const c = carRowOf(stock({ list_model: "WIGO E", list_arrived_on: "2026-09-12", list_fuel: "DSL" }), car(), "2026-11-19");
    expect(c).toMatchObject({ make: "WIGO E", fuel: "DSL" });
    expect(c.daysInStock).toBe(68);
  });
  it("reads Reserved, Sold, For repair and Sell as is", () => {
    expect(carRowOf(stock({ remarks: "RESERVED - SWEET 10/14" }), car(), "2026-11-19")).toMatchObject({ availability: "reserved", sellable: false, reservedFor: ["SWEET"], reservedOn: "10/14" });
    expect(carRowOf(stock({ remarks: "SOLD - DAVID 11/2" }), car(), "2026-11-19").availability).toBe("sold");
    expect(carRowOf(stock({ repair_status: "for repair" }), car(), "2026-11-19")).toMatchObject({ availability: "repair", sellable: false });
    expect(carRowOf(stock({ repair_status: "SELL AS IS" }), car(), "2026-11-19")).toMatchObject({ availability: "asis", sellable: true });
  });
  it("treats an encumbrance of N/A as none, and a Manila unit to Cebu as to Cebu", () => {
    expect(carRowOf(stock(), car(), "2026-11-19").encumbrance).toBe("");
    expect(carRowOf(stock({ body_group: "MANILA UNIT TO CEBU" }), car(), "2026-11-19").toCebu).toBe(true);
  });
  it("uses the About-the-car spare key answer when someone gave one", () => {
    expect(carRowOf(stock(), car({ spare_key: "N/A" }), "2026-11-19", "yes").spareKey).toBe("W/SPAREKEY");
  });
  it("keeps a note that is not a status, and gives the edit screen only to Admin and Approver", () => {
    expect(noteOf("RESERVED - DAVID 11/2 | battery on order")).toBe("battery on order");
    const c = carRowOf(stock({ remarks: "FOR REPAIR - 48V BATTERY" }), car(), "2026-11-19");
    expect(forRole(c, "approver").raw).toMatchObject({ listPrice: 238000, reprice: 228000 });
    expect(forRole(c, "sales").raw).toBeUndefined();
    expect(forRole(c, "documentation").raw).toBeUndefined();
    expect(forRole(c, "sales").target).toBeNull();
  });
});
