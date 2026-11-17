import { describe, expect, it } from "vitest";
import { planResolution, type UnitLite } from "../src/lib/docsbible/review";

const unit: UnitLite = { id: "u1", plate_no: "ABC1234", plate_display: "ABC1234", arrival_date: "2026-10-05", sale_status: "Sold", vehicle_status: "AVAILABLE", classification: "Not classified (legacy)" };
const err = (r: unknown) => (r as { error?: string }).error;

describe("settling a review item", () => {
  it("leaving it as it is saves nothing but the decision", () => {
    expect(planResolution("status_disagree", unit, { type: "keep" })).toMatchObject({ recordOnly: true });
  });
  it("copies the status that is right to the other column", () => {
    expect(planResolution("status_disagree", unit, { type: "use_status", which: "sale" })).toMatchObject({ patch: { fields: { vehicle_status: "SOLD" } } });
    expect(planResolution("status_disagree", unit, { type: "use_status", which: "vehicle" })).toMatchObject({ patch: { fields: { sale_status: "Onhand" } } });
    expect(err(planResolution("status_disagree", { ...unit, sale_status: "Weird" }, { type: "use_status", which: "sale" }))).toBeTruthy();
  });
  it("classifies only with one of the three classifications", () => {
    expect(planResolution("legacy_classification", unit, { type: "classify", value: "Repo (bank)" })).toMatchObject({ patch: { fields: { classification: "Repo (bank)" } } });
    expect(err(planResolution("legacy_classification", unit, { type: "classify", value: "Company" }))).toBeTruthy();
  });
  it("sets a real date and refuses a made-up one", () => {
    expect(planResolution("odd_date", unit, { type: "set_date", date: "7/10/2026" })).toMatchObject({ patch: { fields: { arrival_date: "2026-07-10" } } });
    expect(err(planResolution("odd_date", unit, { type: "set_date", date: "7/102/2026" }))).toBeTruthy();
  });
  it("removes a double entry only on a duplicate item, and keeps the row for the history", () => {
    expect(planResolution("duplicate_plate", unit, { type: "archive", unitId: "u1" })).toMatchObject({ archive: "u1" });
    expect(err(planResolution("legacy_classification", unit, { type: "archive", unitId: "u1" }))).toBeTruthy();
  });
  it("adds a plate to a row that had none, cleaned", () => {
    expect(planResolution("no_plate", null, { type: "add_plate", plate: "ngr 7902" })).toMatchObject({ createFromRow: { plate: "NGR7902" } });
    expect(err(planResolution("no_plate", null, { type: "add_plate", plate: "x" }))).toBeTruthy();
  });
  it("corrects a plate", () => {
    expect(planResolution("odd_plate", unit, { type: "set_plate", plate: "lui 86" })).toMatchObject({ patch: { fields: { plate_no: "LUI86", plate_display: "LUI86" } } });
  });
  it("an action does not fit another kind of item", () => {
    expect(err(planResolution("odd_date", unit, { type: "classify", value: "Clean" }))).toBeTruthy();
  });
});
