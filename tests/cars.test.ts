import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/dashboard/parse";
import { availabilityOf, EMPTY_FILTER, filterCars, forRole, parseInventoryRows, parseMoney, parseSheetDate, sortCars, spareKeyState, summarize } from "@/lib/cars/model";

// the inventory tab as the sheet exports it: a title row, the header row, body-type headings (rows with no plate), then the cars
const TAB = `F,1,, ,,,,,,,,,,,,,,,,,,,,,CURRENT DATE
DOCS,OR EXP,SPAREKEY,,NO. OF DAYS IN THE INVENTORY,YM,BRAND,MAKE,COLOR,MILEAGE,TRANS,FUEL,PLATE NUMBER,PRICE,TARGET,DATE ARRIVED,REPRICE,RE-TARGET,REMARKS,ENCUMBRANCE,TOOLS,LOCATION,REPAIR STATUS,,11/14/2026
,,,0,HATCHBACK,,,,,,,,,,,,,,,,,,,,
,1/1/29,W/SPAREKEY,0,70,26,SUZUKI,SPRESSO 1.0 AGS,GRAY,14T KMS,AT,GAS,NKU8411,"₱578,000","₱565,000",9/5/26,"₱519,000","₱510,000",RESERVED - ELLA 11/10,,,,,,
,05/2027,,1,63,17,TOYOTA,WIGO E,RED,108T KMS,MT,GAS,NBU4875,"₱238,000","₱225,000",9/12/26,,,,,,,,,
,,,0,SEDAN,,,,,,,,,,,,,,,,,,,,
C,,N/A,1,35,15,KIA,PICANTO EX,BLACK,68T KMS,MT,GAS,ASA9497,"₱259,000","₱250,000",10/10/26,,,,JACCS FINANCE - RELEASED,,CLEMENTE,FOR REPAIR,,
,,,1,21,19,HONDA,CITY 1.5E,WHITE,40T KMS,AT,GAS,NBM7701,"₱400,000","₱390,000",10/24/26,,,SOLD - DAVID 3% 11/2,,,,,,
,,,0,MANILA UNIT TO CEBU,,,,,,,,,,,,,,,,,,,,
,,,1,10,22,MG,MG5,BLUE,20T KMS,AT,GAS,IAE5345,,,not a date,,,,,,,SELL AS IS,,
,,,58,,,,,,,,,,,,,,,, ,,,,,
`;

describe("tidying the sheet's text", () => {
  it("reads money, however the sheet shows it", () => {
    expect(parseMoney("₱578,000")).toBe(578000);
    expect(parseMoney("588000.0")).toBe(588000);
    for (const bad of ["", "0", "N/A", "TBA", undefined]) expect(parseMoney(bad)).toBeNull();
  });
  it("reads the dates the sheet shows, and refuses what is not a date", () => {
    expect(parseSheetDate("9/5/26")).toBe("2026-09-05");
    expect(parseSheetDate("9/5/2026")).toBe("2026-09-05");
    expect(parseSheetDate("2026-09-05")).toBe("2026-09-05");
    expect(parseSheetDate("05/2027")).toBe("2027-05-01");
    for (const bad of ["not a date", "13/45/26", "06/012027", ""]) expect(parseSheetDate(bad)).toBeNull();
  });
  it("understands the spare key notes staff type", () => {
    for (const yes of ["W/SPAREKEY", "W/ SPARE KEY", "w/ sparekey"]) expect(spareKeyState(yes)).toBe("yes");
    for (const no of ["N/A", "NO SPAREKEY", "NO SPARE KEY", "NP SPAREKEY"]) expect(spareKeyState(no)).toBe("no");
    expect(spareKeyState("")).toBe("unknown");
  });
});

describe("what makes a car sellable", () => {
  it("reserved and sold come from the status note; repair from the repair status or a note that starts with FOR REPAIR", () => {
    expect(availabilityOf("RESERVED - ELLA 11/10", "")).toBe("reserved");
    expect(availabilityOf("SOLD - DAVID 3% 11/2", "")).toBe("sold");
    expect(availabilityOf("", "FOR REPAIR")).toBe("repair");
    expect(availabilityOf("FOR REPAIR - 48V BATTERY ARRIVED (11/7)", "")).toBe("repair");
    expect(availabilityOf("", "SELL AS IS")).toBe("asis");
    expect(availabilityOf("", "READY TO SELL")).toBe("available");
    expect(availabilityOf("", "")).toBe("available");
    expect(availabilityOf("RESERVED - ELLA 11/10", "FOR REPAIR")).toBe("reserved"); // a reservation comes first
  });
});

describe("reading the tab", () => {
  const cars = parseInventoryRows(parseCsv(TAB), "2026-11-14");
  const by = (p: string) => cars.find((c) => c.plate === p)!;
  it("finds every car and skips headings and totals", () => { expect(cars.map((c) => c.plate)).toEqual(["NKU8411", "NBU4875", "ASA9497", "NBM7701", "IAE5345"]); });
  it("puts each car under its body-type heading", () => {
    expect([by("NKU8411").bodyType, by("ASA9497").bodyType, by("IAE5345").bodyType]).toEqual(["HATCHBACK", "SEDAN", "MANILA UNIT TO CEBU"]);
    expect(by("IAE5345").toCebu).toBe(true);
    expect(by("NBU4875").toCebu).toBe(false);
  });
  it("quotes the repriced price and keeps the old one", () => {
    expect(by("NKU8411")).toMatchObject({ price: 519000, originalPrice: 578000, repriced: true, target: 510000 });
    expect(by("NBU4875")).toMatchObject({ price: 238000, repriced: false, target: 225000 });
  });
  it("counts the days from the arrival date and gives the full year", () => {
    expect(by("NKU8411")).toMatchObject({ arrived: "2026-09-05", daysInStock: 70, year: "2026" });
    expect(by("IAE5345")).toMatchObject({ arrived: null, daysInStock: null, price: null });
  });
  it("works out availability and who reserved it", () => {
    expect(by("NKU8411")).toMatchObject({ availability: "reserved", reservedFor: ["ELLA"], reservedOn: "11/10", sellable: false });
    expect(by("ASA9497")).toMatchObject({ availability: "repair", sellable: false, encumbrance: "JACCS FINANCE - RELEASED", docsCode: "C" });
    expect(by("NBM7701").availability).toBe("sold");
    expect(by("IAE5345")).toMatchObject({ availability: "asis", sellable: true });
  });
  it("fails clearly when the header is not there", () => { expect(() => parseInventoryRows([["a", "b"]], "2026-11-14")).toThrow(/PLATE NUMBER/); });

  it("counts for the tiles", () => {
    expect(summarize(cars)).toMatchObject({ total: 5, sellable: 2, available: 1, asis: 1, reserved: 1, sold: 1, repair: 1 });
  });
  it("filters by words, status, brand, price, year and the sellable switch", () => {
    expect(filterCars(cars, { ...EMPTY_FILTER, q: "wigo red" }).map((c) => c.plate)).toEqual(["NBU4875"]);
    expect(filterCars(cars, { ...EMPTY_FILTER, q: "nbu 4875" }).map((c) => c.plate)).toEqual(["NBU4875"]);
    expect(filterCars(cars, { ...EMPTY_FILTER, availability: ["reserved", "repair"] }).map((c) => c.plate)).toEqual(["NKU8411", "ASA9497"]);
    expect(filterCars(cars, { ...EMPTY_FILTER, brands: ["KIA"] }).map((c) => c.plate)).toEqual(["ASA9497"]);
    expect(filterCars(cars, { ...EMPTY_FILTER, priceMax: 250000 }).map((c) => c.plate)).toEqual(["NBU4875"]);
    expect(filterCars(cars, { ...EMPTY_FILTER, yearMin: 2019 }).map((c) => c.plate).sort()).toEqual(["IAE5345", "NBM7701", "NKU8411"].sort());
    expect(filterCars(cars, { ...EMPTY_FILTER, sellableOnly: true }).map((c) => c.plate)).toEqual(["NBU4875", "IAE5345"]);
    expect(filterCars(cars, { ...EMPTY_FILTER, spareKey: true }).map((c) => c.plate)).toEqual(["NKU8411"]);
    expect(filterCars(cars, { ...EMPTY_FILTER, bodyTypes: ["SEDAN"] }).map((c) => c.plate)).toEqual(["ASA9497", "NBM7701"]);
  });
  it("sorts, with cars that have no price or date last", () => {
    expect(sortCars(cars, "priceLow").map((c) => c.plate)).toEqual(["NBU4875", "ASA9497", "NBM7701", "NKU8411", "IAE5345"]);
    expect(sortCars(cars, "priceHigh").map((c) => c.plate)[0]).toBe("NKU8411");
    expect(sortCars(cars, "newest").map((c) => c.plate).at(-1)).toBe("IAE5345");
    expect(sortCars(cars, "oldest")[0].plate).toBe("NKU8411");
  });
  it("keeps the internal fields away from a role that must not see them", () => {
    const c = by("ASA9497");
    expect(forRole(c, "sales")).toMatchObject({ target: null, encumbrance: "", orExp: null, docsCode: "" });
    expect(forRole(c, "documentation")).toMatchObject({ target: null, encumbrance: "JACCS FINANCE - RELEASED", docsCode: "C" });
    expect(forRole(c, "admin")).toMatchObject({ target: 250000, encumbrance: "JACCS FINANCE - RELEASED" });
    expect(forRole(c, "approver").target).toBe(250000);
    expect(forRole(c, "sales").price).toBe(259000); // the quoted price is for everyone
  });
});
