import { describe, expect, it } from "vitest";
import { checkBody, checkFuel, checkMileage, checkSpareKey, checkTrans, checkWords, checkYear, FIELD_BY_KEY, formatPlate, tidyOf } from "@/lib/cars/standards";
import { findTidy, type TidyRow } from "@/lib/cars/tidy";
import { checkEdit, COLUMN_BY_KEY, canEditColumn } from "@/lib/docsbible/grid";

const ok = (v: string | null) => ({ ok: true, value: v });

describe("one format for every detail of a car", () => {
  it("the year is kept as two digits and accepted as two or four", () => {
    expect(checkYear("2019")).toEqual(ok("19"));
    expect(checkYear(" 19 ")).toEqual(ok("19"));
    expect(checkYear("")).toEqual(ok(null));
    for (const bad of ["201", "1850", "abcd", "20199"]) expect(checkYear(bad).ok).toBe(false);
  });
  it("mileage becomes whole kilometres written 45,000 KM, whatever the way it was typed", () => {
    for (const typed of ["45000", "45,000", "45000 km", "45000 KMS", "45k", "45T", "45T KMS", "45 thousand"]) expect(checkMileage(typed), typed).toEqual(ok("45,000 KM"));
    expect(checkMileage("120000")).toEqual(ok("120,000 KM"));
    expect(checkMileage("")).toEqual(ok(null));
  });
  it("a bare small number or words are not a mileage, so nobody guesses 45 or 45,000", () => {
    for (const bad of ["45", "lots", "45 miles", "9999999"]) expect(checkMileage(bad).ok, bad).toBe(false);
  });
  it("the pick lists accept the usual ways of writing a value and give the standard one", () => {
    expect(checkTrans("automatic")).toEqual(ok("AT"));
    expect(checkTrans("a/t")).toEqual(ok("AT"));
    expect(checkTrans("semi").ok).toBe(false);
    expect(checkTrans("cvt")).toEqual(ok("CVT"));
    expect(checkFuel("dsl")).toEqual(ok("DIESEL"));
    expect(checkFuel("Gasoline")).toEqual(ok("GAS"));
    expect(checkFuel("gas-hybrid")).toEqual(ok("GAS - HYBRID"));
    expect(checkFuel("EV")).toEqual(ok("ELECTRIC"));
    expect(checkFuel("PHEV")).toEqual(ok("PH EV"));
    expect(checkFuel("steam").ok).toBe(false);
    expect(checkBody("pickup")).toEqual(ok("PICK-UP"));
    expect(checkBody("hatch")).toEqual(ok("HATCHBACK"));
    expect(checkBody("spaceship").ok).toBe(false);
    expect(checkSpareKey("no sparekey")).toEqual(ok("W/O SPAREKEY"));
    expect(checkSpareKey("w/ spare key")).toEqual(ok("W/SPAREKEY"));
    expect(checkSpareKey("n/a")).toEqual(ok("N/A"));
  });
  it("make, model and color are capitals with single spaces", () => {
    expect(checkWords("make", 40)("  toyota  ")).toEqual(ok("TOYOTA"));
    expect(checkWords("model", 80)("vios  1.3   e")).toEqual(ok("VIOS 1.3 E"));
    expect(checkWords("color", 40)("white pearl")).toEqual(ok("WHITE PEARL"));
    expect(checkWords("make", 5)("TOYOTA").ok).toBe(false);
  });
  it("says whether a stored value already fits, and the fix when it does not", () => {
    expect(tidyOf("mileage", "45,000 KM")).toEqual({ fits: true });
    expect(tidyOf("mileage", "45T KMS")).toMatchObject({ fits: false, suggestion: "45,000 KM" });
    expect(tidyOf("fuel", "DSL")).toMatchObject({ fits: false, suggestion: "DIESEL" });
    expect(tidyOf("fuel", "steam")).toMatchObject({ fits: false, suggestion: null });
    expect(tidyOf("make", "toyota")).toMatchObject({ fits: false, suggestion: "TOYOTA" });
    expect(tidyOf("color", "")).toEqual({ fits: true });
  });
});

const row = (over: Partial<TidyRow> = {}): TidyRow => ({ id: "11111111-1111-4111-8111-111111111111", plate_no: "AAA1111", plate_display: "AAA 1111", year_model: "19", make: "TOYOTA", model_variant: "VIOS", color: "WHITE", body_type: "SEDAN", trans: "AT", fuel: "GAS", mileage: "45,000 KM", spare_key: "W/SPAREKEY", list_model: null, list_color: null, list_mileage: null, list_fuel: null, ...over });

describe("the company\'s words for a car", () => {
  it("the Brand is TOYOTA, the Make is VIOS 1.3 E and the Model is the year model", () => {
    expect(FIELD_BY_KEY.get("make")!.label).toBe("Brand");
    expect(FIELD_BY_KEY.get("model_variant")!.label).toBe("Make");
    expect(FIELD_BY_KEY.get("year_model")!.label).toBe("Model (year)");
    expect(checkYear("abc")).toEqual({ ok: false, error: "Type the model year like 2019." });
  });
  it("a plate is written NKF 4771: capitals, three letters, a space, the digits", () => {
    for (const typed of ["nkf4771", "NKF 4771", " nkf  4771 ", "nkf-4771"]) expect(formatPlate(typed), typed).toBe("NKF 4771");
    expect(formatPlate("zzt 7010")).toBe("ZZT 7010");
    expect(formatPlate("ab 12")).toBe("AB 12"); // another shape is only tidied
    expect(formatPlate("")).toBe("");
  });
});

describe("the tidy up list", () => {
  it("a car that follows the standards has nothing to tidy", () => {
    expect(findTidy([row()])).toEqual([]);
  });
  it("lists each value that does not fit, with the fix, and the ones with no fix to choose", () => {
    const items = findTidy([row({ mileage: "45T KMS", fuel: "DSL", body_type: "SPACESHIP", make: "toyota" })]);
    expect(items.map((i) => [i.field, i.current, i.suggestion])).toEqual(expect.arrayContaining([["mileage", "45T KMS", "45,000 KM"], ["fuel", "DSL", "DIESEL"], ["body_type", "SPACESHIP", null], ["make", "toyota", "TOYOTA"]]));
    expect(items).toHaveLength(4);
  });
  it("looks at what the screens show: the price list's copy when it has one, and flags a copy that disagrees with the record", () => {
    const items = findTidy([row({ list_color: "WHITE PEARL", color: "WHITE" }), row({ list_model: "vios", model_variant: "VIOS" })]);
    expect(items.find((i) => i.field === "color")).toMatchObject({ current: "WHITE PEARL", suggestion: "WHITE PEARL" });
    expect(items.find((i) => i.field === "model_variant")).toMatchObject({ current: "vios", suggestion: "VIOS" });
    expect(findTidy([row({ list_color: "WHITE", color: "white" })])).toEqual([]); // same words: nothing to decide
  });
});

describe("who types the details", () => {
  it("the Admins change a car's details; Buying keeps the papers and the spare key", () => {
    for (const key of ["year_model", "make", "model_variant", "color", "mileage", "trans", "fuel", "body_type"]) {
      expect(canEditColumn("admin", COLUMN_BY_KEY.get(key)!), key).toBe(true);
      expect(canEditColumn("super_admin", COLUMN_BY_KEY.get(key)!), key).toBe(true);
      expect(canEditColumn("buying", COLUMN_BY_KEY.get(key)!), key).toBe(false);
      expect(canEditColumn("sales", COLUMN_BY_KEY.get(key)!), key).toBe(false);
    }
    expect(canEditColumn("buying", COLUMN_BY_KEY.get("cr")!)).toBe(true);
    expect(canEditColumn("buying", COLUMN_BY_KEY.get("spare_key")!)).toBe(true);
  });
  it("typing in the table follows the same standards", () => {
    expect(checkEdit(COLUMN_BY_KEY.get("mileage")!, "45T KMS")).toEqual({ ok: true, value: "45,000 KM" });
    expect(checkEdit(COLUMN_BY_KEY.get("year_model")!, "2019")).toEqual({ ok: true, value: "19" });
    expect(checkEdit(COLUMN_BY_KEY.get("fuel")!, "steam")).toMatchObject({ ok: false });
    expect(checkEdit(COLUMN_BY_KEY.get("cs_no")!, "ab 12")).toMatchObject({ ok: true });
  });
});
