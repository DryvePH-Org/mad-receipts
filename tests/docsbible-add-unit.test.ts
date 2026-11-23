import { describe, expect, it } from "vitest";
import { checkNewUnit, yearModel } from "../src/lib/docsbible/add-unit";

const base = { make: "toyota", model_variant: "vios 1.3 e", year_model: "2019", color: "white" };

describe("the Add a car form", () => {
  it("keeps the year the way the sheet does: two digits", () => {
    expect(yearModel("2019")).toBe("19");
    expect(yearModel("19")).toBe("19");
    expect(yearModel("1999")).toBe("99");
    expect(yearModel("3019")).toBeNull();
    expect(yearModel("abc")).toBeNull();
  });
  it("needs the make, model, year and color, and says which are missing", () => {
    const r = checkNewUnit({ make: "", model_variant: "", year_model: "", color: "" }, "2026-11-18");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(["make", "model_variant", "year_model", "color"]);
  });
  it("turns what was typed into the register's columns, in capitals like the sheet", () => {
    const r = checkNewUnit({ ...base, trans: "at", spare_key: "w/ spare key", mileage: "45t kms", reg_owner_name: " juan  dela cruz " }, "2026-11-18");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.fields).toMatchObject({ make: "TOYOTA", model_variant: "VIOS 1.3 E", year_model: "19", color: "WHITE", trans: "AT", spare_key: "W/SPAREKEY", mileage: "45,000 KM", reg_owner_name: "JUAN DELA CRUZ", sale_status: "Onhand", vehicle_status: "AVAILABLE", category: "NORMAL" });
  });
  it("uses today as the arrival date unless one is typed, and refuses a made-up date", () => {
    const a = checkNewUnit(base, "2026-11-18"); expect(a.ok && a.fields.arrival_date).toBe("2026-11-18");
    const b = checkNewUnit({ ...base, arrival_date: "11/5/2026" }, "2026-11-18"); expect(b.ok && b.fields.arrival_date).toBe("2026-11-05");
    expect(checkNewUnit({ ...base, arrival_date: "7/102/2026" }, "2026-11-18").ok).toBe(false);
  });
  it("only accepts AT, MT or CVT for the transmission, and standard fuel, body type and mileage", () => {
    expect(checkNewUnit({ ...base, trans: "CVT" }, "2026-11-18").ok).toBe(true);
    expect(checkNewUnit({ ...base, trans: "CVTX" }, "2026-11-18").ok).toBe(false);
    expect(checkNewUnit({ ...base, fuel: "steam", mileage: "lots" }, "2026-11-18")).toMatchObject({ ok: false, errors: { fuel: expect.any(String), mileage: expect.any(String) } });
  });
});
