import { describe, expect, it } from "vitest";
import { carRowOf, noteOf, type CarFacts, type StockFacts } from "@/lib/cars/from-db";
import { forRole } from "@/lib/cars/model";

const stock = (o: Partial<StockFacts> = {}): StockFacts => ({ plate_no: "NBU4875", body_group: "HATCHBACK", list_price: 238000, target_price: 225000, reprice: 228000, retarget: 215000, or_expiry: null, papers_with: "C", tools: null, location: "ROSE MARY", repair_status: null, remarks: null, ...o });
const car = (o: Partial<CarFacts> = {}): CarFacts => ({ plate_display: "NBU4875", arrival_date: "2026-09-11", year_model: "17", make: "TOYOTA", model_variant: "WIGO 1.0G E MT", color: "RED", mileage: "108T KMS", trans: "MT", fuel: "GAS", encumbrance: "N/A", spare_key: null, body_type: null, or_expiry: "2027-05-15", ...o });

describe("a Car Inventory row from the database", () => {
  it("quotes the repriced price and knows it was repriced", () => {
    const c = carRowOf(stock(), car(), "2026-11-19");
    expect(c).toMatchObject({ plate: "NBU4875", year: "2017", brand: "TOYOTA", make: "WIGO 1.0G E MT", price: 228000, originalPrice: 238000, repriced: true, target: 215000, bodyType: "HATCHBACK", orExp: "2027-05-15", docsCode: "C", availability: "available", sellable: true });
    expect(c.daysInStock).toBe(69);
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
  it("shows the car record's spare key (one fact); a stored checklist answer only fills in when the record has none", () => {
    expect(carRowOf(stock(), car({ spare_key: "N/A" }), "2026-11-19", "yes").spareKey).toBe("N/A");
    expect(carRowOf(stock(), car({ spare_key: null }), "2026-11-19", "yes").spareKey).toBe("W/SPAREKEY");
  });
  it("keeps a note that is not a status, and gives the edit screen only to the roles that edit the price list", () => {
    expect(noteOf("RESERVED - DAVID 11/2 | battery on order")).toBe("battery on order");
    const c = carRowOf(stock({ remarks: "FOR REPAIR - 48V BATTERY" }), car(), "2026-11-19");
    expect(forRole(c, "admin").raw).toMatchObject({ listPrice: 238000, reprice: 228000 });
    expect(forRole(c, "sales").raw).toMatchObject({ listPrice: 238000 });
    expect(forRole(c, "buying").raw).toBeUndefined();
    expect(forRole(c, "marketing").raw).toBeUndefined();
    expect(forRole(c, "marketing").target).toBeNull();
  });
});

describe("Car Inventory with the one status", () => {
  const withState = (state: NonNullable<CarFacts["stock_state"]>, who: string | null = null, on: string | null = null) => car({ stock_state: state, state_for: who, state_on: on });
  it("reads the state, not the old note", () => {
    const c = carRowOf(stock({ remarks: "RESERVED - OLD 1/1 | keep this note" }), withState("Reserved", "DAVID", "2026-11-02"), "2026-11-19");
    expect(c).toMatchObject({ availability: "reserved", sellable: false, reservedFor: ["DAVID"], reservedOn: "11/2" });
    expect(c.remarks).toBe("RESERVED - DAVID 11/2 | keep this note"); // the old status part is ignored, the note stays
  });
  it("maps each state", () => {
    expect(carRowOf(stock(), withState("Onhand"), "2026-11-19")).toMatchObject({ availability: "available", sellable: true });
    expect(carRowOf(stock(), withState("Sold", "DAVID 3%", "2026-11-02"), "2026-11-19").availability).toBe("sold");
    expect(carRowOf(stock(), withState("For repair"), "2026-11-19")).toMatchObject({ availability: "repair", repairStatus: "FOR REPAIR" });
    expect(carRowOf(stock(), withState("Sell as is"), "2026-11-19")).toMatchObject({ availability: "asis", sellable: true });
    expect(carRowOf(stock(), withState("Not for sale"), "2026-11-19")).toMatchObject({ availability: "notforsale", sellable: false });
    expect(carRowOf(stock(), withState("Shipped to Cebu"), "2026-11-19")).toMatchObject({ availability: "available", toCebu: true });
  });
  it("falls back to the old note and repair state for a car with no state yet", () => {
    expect(carRowOf(stock({ remarks: "SOLD - DAVID 11/2" }), car(), "2026-11-19").availability).toBe("sold");
  });
});
