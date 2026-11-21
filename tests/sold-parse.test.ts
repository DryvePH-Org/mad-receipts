import { describe, expect, it } from "vitest";
import { cleanPhone, financingOf, liaisonIn, fixMake, fuelOf, looksLikeOffice, normPlate, officeKey, originalsAt, parseSoldDate, plateProblem, salesperson, stageOf, yearModel } from "@/lib/sold/parse";

describe("plates", () => {
  it("normalises and flags what is not a plate", () => {
    expect(normPlate(" nbw 8246 ")).toBe("NBW8246");
    expect(plateProblem("NBW 8246")).toBeNull();
    expect(plateProblem("TIM89")).toBeNull();
    expect(plateProblem("AJD23")).toBeNull();
    expect(plateProblem("4744-11-01")).toMatch(/date/);
    expect(plateProblem("B V")).toMatch(/does not look/);
    expect(plateProblem("")).toBe("no plate");
  });
});

describe("phone numbers", () => {
  it("brings back the leading zero the sheet lost", () => {
    expect(cleanPhone(9150883867)).toEqual({ value: "09150883867" });
    expect(cleanPhone("9171099733")).toEqual({ value: "09171099733" });
    expect(cleanPhone("09171099733")).toEqual({ value: "09171099733" });
    expect(cleanPhone("+63 917 109 9733")).toEqual({ value: "09171099733" });
    expect(cleanPhone(null)).toEqual({ value: null });
  });
  it("keeps a number it cannot trust as typed, and says so", () => {
    expect(cleanPhone(91664585132)).toMatchObject({ value: "91664585132", problem: expect.any(String) });
  });
});

describe("sold dates", () => {
  it("reads the formats in the sheet", () => {
    expect(parseSoldDate("2026-03-31")).toEqual({ date: "2026-03-31", precision: "day" });
    expect(parseSoldDate("10/12/2026")).toEqual({ date: "2026-10-12", precision: "day" });
    expect(parseSoldDate("7/132026")).toEqual({ date: "2026-07-13", precision: "day" });
    expect(parseSoldDate(null)).toEqual({ date: null, precision: "none" });
  });
  it("flags a wrong year and a date that cannot be read", () => {
    expect(parseSoldDate("2027-03-21")).toMatchObject({ date: "2027-03-21", problem: expect.stringContaining("2027") });
    expect(parseSoldDate("1935-01-02").problem).toBeTruthy();
    expect(parseSoldDate("13/40/2026").problem).toBeTruthy();
    expect(parseSoldDate("soon").problem).toBeTruthy();
  });
});

describe("people and stages", () => {
  it("fixes the sales names", () => {
    expect(salesperson("ELLLA")).toEqual({ name: "ELLA" });
    expect(salesperson(" david ")).toEqual({ name: "DAVID" });
    expect(salesperson("NONE")).toEqual({ name: null });
    expect(salesperson("PAOLO").problem).toBeTruthy();
  });
  it("turns the row color into a stage", () => {
    expect(stageOf("white")).toBe("in_process");
    expect(stageOf("yellow")).toBe("transferred");
    expect(stageOf("red")).toBe("released");
    expect(stageOf("green")).toBe("delivered");
    expect(stageOf("none", "ONGOING PROCESS OF DOCS")).toBe("in_process");
    expect(stageOf("none", "COMPLETED")).toBe("unknown");
  });
});

describe("the notes", () => {
  it("finds the financing company", () => {
    expect(financingOf("ORIG DOCS AT S' JEP FOR TRANSFER GDFI TEMP CR")).toBe("GDFI");
    expect(financingOf("RELEASE TO SAFC- ALYSSA")).toBe("SAFC");
    expect(financingOf("ORIG DOCS ON HAND", null)).toBeNull();
  });
  it("finds where the originals are", () => {
    expect(originalsAt("ORIG DOCS AT S' JEP FOR TRANSFER")).toBe("with Jep");
    expect(originalsAt("ORIG DOCS AT S' LEO FOR TRANSFER\nGDFI")).toBe("with Leo");
    expect(originalsAt("ORIG DOCS ON HAND")).toBe("on hand at MAD");
    expect(originalsAt("ORIG DOC ONHAND")).toBe("on hand at MAD");
    expect(originalsAt("ORIG DOCS AT SIR LEO FOR TRANSFER")).toBe("with Leo");
    expect(originalsAt("LACKING ID")).toBeNull();
    expect(liaisonIn("LTO - SUBMITTED TO JEP")).toBe("JEP");
    expect(liaisonIn("ORIG DOCS AT S' LEO FOR TRANSFER")).toBe("LEO");
    expect(liaisonIn("JEP AND LEO")).toBeNull();
    expect(liaisonIn("ORIG DOCS ON HAND")).toBeNull();
  });
});

describe("the car", () => {
  it("keeps the year as two digits and the make and fuel as MAD writes them", () => {
    expect(yearModel("2021")).toBe("21");
    expect(yearModel(19)).toBe("19");
    expect(yearModel("")).toBeNull();
    const known = ["MERCEDES-BENZ", "MITSUBISHI", "TOYOTA"];
    expect(fixMake("MERCEDES BENZ", known)).toBe("MERCEDES-BENZ");
    expect(fixMake("MITSUBIHSI", known)).toBe("MITSUBISHI");
    expect(fixMake("GEELY ", known)).toBe("GEELY");
    expect(fuelOf("DSL")).toBe("DSL");
    expect(fuelOf("HYBRID")).toBe("GAS - HYBRID");
    expect(fuelOf("ELECTR")).toBe("ELECTRIC");
    expect(fuelOf("GAS")).toBe("GAS");
  });
  it("tells a CR office from a person's name, and two spellings of one office", () => {
    expect(looksLikeOffice("LA LOMA DISTRICT OFFICE")).toBe(true);
    expect(looksLikeOffice("NCR NEW REGISTRATION UNIT")).toBe(true);
    expect(looksLikeOffice("JOHN ANTHONY JAVILLO ANG")).toBe(false);
    expect(officeKey("LA LOMA DISTRICT OFFICE")).toBe(officeKey("LA LOMA"));
    expect(officeKey("MUNTINLUPA")).toBe(officeKey("Muntinlupa District Office"));
  });
});
