import { describe, expect, it } from "vitest";
import { buildPriceListRows, daysInStock, rowKind, sellableFlag, type PriceRow } from "@/lib/pricelist/export";
import { blankFills, compareWithDocs, identityOverrides, isTestRow, newUnitFromList, stockRow, normalizeCar, normalizeRenewal, normalizeRepair, spareKeyState, type SnapshotRow } from "@/lib/pricelist/import";

const car = (o: Record<string, unknown> = {}): SnapshotRow => ({ _row: 4, _group: "HATCHBACK", _order: 1, "PLATE NUMBER": "NBU4875", BRAND: "TOYOTA", MAKE: "WIGO E", COLOR: "RED", YM: 17, PRICE: 238000, TARGET: 225000, REPRICE: 228000, "RE-TARGET": 215000, "DATE ARRIVED": "2026-09-12", "OR EXP": "2027-05-15", ...o }) as SnapshotRow;

describe("taking a price list row over", () => {
  it("reads prices, dates and the group", () => {
    const { stock, issues } = normalizeCar(car());
    expect(stock).toMatchObject({ plate: "NBU4875", group: "HATCHBACK", listPrice: 238000, reprice: 228000, orExpiry: "2027-05-15" });
    expect(issues).toEqual([]);
  });
  it("leaves test rows out", () => {
    expect(normalizeCar(car({ "PLATE NUMBER": "TST 001" })).stock).toBeNull();
    expect(isTestRow(car({ "PLATE NUMBER": "ABC 1234" }))).toBe(true);
    expect(isTestRow(car())).toBe(false);
  });
  it("reads a price typed as text, and says so when it is not an amount", () => {
    expect(normalizeCar(car({ PRICE: "₱1,099,000" })).stock?.listPrice).toBe(1099000);
    const odd = normalizeCar(car({ PRICE: "ASK" }));
    expect(odd.stock?.listPrice).toBeNull();
    expect(odd.issues[0].field).toBe("odd_value");
  });
  it("keeps an OR expiry that is not a date as typed and puts it on the review list", () => {
    const r = normalizeCar(car({ "OR EXP": "06/012027" }));
    expect(r.stock).toMatchObject({ orExpiry: null, orExpiryRaw: "06/012027" });
    expect(r.issues.map((i) => i.field)).toContain("odd_value");
  });
  it("keeps the DOCS code as typed and puts it on the review list", () => {
    const r = normalizeCar(car({ DOCS: "L:SERJEL" }));
    expect(r.stock?.papersWith).toBe("L:SERJEL");
    expect(r.issues.map((i) => i.field)).toEqual(["docs_code"]);
  });
  it("flags an unusual plate", () => {
    expect(normalizeCar(car({ "PLATE NUMBER": "NU355A" })).issues.map((i) => i.field)).toContain("odd_value");
  });
});

describe("differences with the Docs Bible (the price list check)", () => {
  const unit = { year_model: "17", make: "TOYOTA", model_variant: "WIGO E", color: "RED", trans: "MT", fuel: "GAS", spare_key: null, mileage: "108T KMS", encumbrance: null, arrival_date: "2026-09-12", sale_status: "Onhand", vehicle_status: "AVAILABLE" };
  const s = normalizeCar(car({ TRANS: "MT", FUEL: "GAS", MILEAGE: "108T KMS" })).stock!;
  it("sees no difference when they say the same", () => expect(compareWithDocs(s, unit)).toEqual([]));
  it("treats the same fuel written two ways as the same, and a blank as no difference", () => {
    const a = normalizeCar(car({ FUEL: "DSL", SPAREKEY: "N/A", ENCUMBRANCE: null })).stock!;
    expect(compareWithDocs(a, { ...unit, fuel: "DIESEL", spare_key: "W/O SPAREKEY", encumbrance: "N/A" })).toEqual([]);
  });
  it("lists every real difference, one item each, with both values", () => {
    const a = normalizeCar(car({ COLOR: "WHITE", SPAREKEY: "W/SPAREKEY", MAKE: "WIGO", "DATE ARRIVED": "2026-09-20" })).stock!;
    const d = compareWithDocs(a, { ...unit, spare_key: "NO SPARE KEY" });
    expect(d.map((i) => i.field).sort()).toEqual(["arrival_date", "color", "model", "spare_key"]);
    expect(d.find((i) => i.field === "color")).toMatchObject({ listValue: "WHITE", docsValue: "RED", plate: "NBU4875" });
  });
  it("no longer compares the status: it is one fact on the car record", () => {
    const reserved = normalizeCar(car({ REMARKS: "RESERVED - SWEET 10/14" })).stock!;
    expect(compareWithDocs(reserved, unit).map((i) => i.field)).not.toContain("status");
    expect(compareWithDocs(s, { ...unit, sale_status: "Sold", vehicle_status: "SOLD" }).map((i) => i.field)).not.toContain("status");
  });
  it("reads spare key texts", () => {
    expect(spareKeyState("W/SPAREKEY TBF")).toBe("yes");
    expect(spareKeyState("W/ SPAREKEY & SERVICE BOOKLET")).toBe("yes");
    expect(spareKeyState("W/O SPAREKEY")).toBe("no");
    expect(spareKeyState("N/A")).toBe("no");
    expect(spareKeyState("")).toBe("unknown");
  });
});

describe("what the price list showed differently", () => {
  const unit = { year_model: "17", make: "TOYOTA", model_variant: "WIGO 1.0G E MT", color: "RED", trans: "MT", fuel: "DIESEL", spare_key: null, mileage: "108T KMS", encumbrance: "N/A", arrival_date: "2026-09-11" };
  const s = normalizeCar(car({ MAKE: "WIGO E", MILEAGE: "108T KMS", FUEL: "DSL", ENCUMBRANCE: null, "DATE ARRIVED": "2026-09-12" })).stock!;
  it("keeps the sheet's own words so the export reads like the sheet", () => {
    expect(identityOverrides(s, unit)).toEqual({ model: "WIGO E", color: null, mileage: null, fuel: "DSL", arrivedOn: "2026-09-12", encumbrance: null });
  });
  it("keeps nothing when they say the same, or when the sheet left it blank", () => {
    const same = normalizeCar(car({ MAKE: "WIGO 1.0G E MT" })).stock!;
    expect(identityOverrides(same, { ...unit, fuel: "GAS", arrival_date: "2026-09-12" })).toEqual({ model: null, color: null, mileage: null, fuel: null, arrivedOn: null, encumbrance: null });
  });
  it("puts a different arrival date on the check list (it decides the days in stock)", () => {
    expect(compareWithDocs(s, unit).map((i) => i.field)).toContain("arrival_date");
  });
});

describe("the two small lists", () => {
  it("reads a repair", () => {
    expect(normalizeRepair({ _row: 2, "PLATE NUMBER": "AAQ3989", PROBLEM: "DOOR", "WHEN THE PROBLEM HAPPENED": "2026-09-27", STATUS: "DONE" } as SnapshotRow, 1)).toMatchObject({ plate: "AAQ3989", happenedOn: "2026-09-27", status: "DONE" });
  });
  it("reads a renewal with its notes in order", () => {
    expect(normalizeRenewal({ _row: 2, "PLATE NUMBER": "NFL6959", N: "AUGUST", "OR EXP": "2027-07-01", "REMARKS I": "RECEIVED", "REMARKS III": "PRINT" } as SnapshotRow, 1)).toMatchObject({ plate: "NFL6959", monthLabel: "AUGUST", notes: ["RECEIVED", "PRINT"] });
  });
});

const row = (o: Partial<PriceRow> = {}): PriceRow => ({ group: "SEDAN", order: 1, papersWith: null, orExpiry: null, orExpiryRaw: null, spareKey: null, arrived: "2026-09-12", ym: "17", brand: "TOYOTA", make: "VIOS", color: "RED", mileage: null, trans: "AT", fuel: "GAS", plate: "AAA1111", price: 400000, target: 390000, reprice: null, retarget: null, remarks: null, encumbrance: null, tools: null, location: null, repairStatus: null, ...o });

describe("the Excel layout", () => {
  it("counts the days in stock", () => {
    expect(daysInStock("2026-09-12", "2026-11-18")).toBe(67);
    expect(daysInStock(null, "2026-11-18")).toBeNull();
  });
  it("colours reserved and repair rows and counts what can be sold", () => {
    expect(rowKind(row({ remarks: "RESERVED - DAVID 11/15" }))).toBe("reserved");
    expect(rowKind(row({ remarks: "FOR REPAIR - battery" }))).toBe("repair");
    expect(rowKind(row({ repairStatus: "FOR REPAIR" }))).toBe("repair");
    expect(rowKind(row({ remarks: "AVAILABLE - reservation cancelled" }))).toBe("normal");
    expect(sellableFlag(row({ remarks: "RESERVED - X 1/1" }))).toBe(0);
    expect(sellableFlag(row())).toBe(1);
    expect(sellableFlag(row({ price: null }))).toBe(0); // not priced yet: not for sale
  });
  it("puts a heading row where the group changes, keeps the sheet's order, and adds the total", () => {
    const { data, stickyRowsCount } = buildPriceListRows([row({ order: 2, plate: "BBB2222", group: "SUV/MPV" }), row({ order: 1 }), row({ order: 3, plate: "CCC3333", group: "SUV/MPV", remarks: "RESERVED - A 1/1" })], "2026-11-18", "MAD PRICELIST");
    expect(stickyRowsCount).toBe(2);
    expect(data[1].map((c) => c?.value)[12]).toBe("PLATE NUMBER");
    const headings = data.filter((r) => r[0]?.backgroundColor === "#00FFFF").map((r) => r[4]?.value);
    expect(headings).toEqual(["SEDAN", "SUV/MPV"]);
    const plates = data.map((r) => r[12]?.value).filter((v) => typeof v === "string" && /\d{4}$/.test(v));
    expect(plates).toEqual(["AAA1111", "BBB2222", "CCC3333"]);
    const last = data[data.length - 1];
    expect(last[3]?.value).toBe(2); // two of the three cars can be sold
    expect(data.find((r) => r[12]?.value === "CCC3333")?.[0]?.backgroundColor).toBe("#B6D7A8");
  });
});

import { choicesFor, planSettle } from "@/lib/pricelist/sync";
describe("settling an item of the price list check", () => {
  it("copies the price list's value into the Docs Bible and clears the stock row's own wording", () => {
    expect(planSettle("color", "list", { listValue: "WHITE", docsValue: "RED" })).toMatchObject({ docsPatch: { color: "WHITE" }, clearOverride: "list_color" });
    expect(planSettle("year", "list", { listValue: "2017", docsValue: "18" })).toMatchObject({ docsPatch: { year_model: "17" } });
  });
  it("keeps the Docs Bible's value by only clearing the stock row's own wording", () => {
    const p = planSettle("arrival_date", "docs", { listValue: "2026-09-20", docsValue: "2026-09-12" });
    expect(p).toMatchObject({ clearOverride: "list_arrived_on" });
    expect("docsPatch" in p).toBe(false);
  });
  it("settles an old status item by setting the car's one state to the side that was chosen", () => {
    expect(planSettle("status", "list", { listValue: "RESERVED - SWEET 10/14", docsValue: "Onhand / AVAILABLE" })).toMatchObject({ docsPatch: { stock_state: "Reserved" } });
    expect(planSettle("status", "docs", { listValue: "RESERVED - SWEET 10/14", docsValue: "Onhand / AVAILABLE" })).toMatchObject({ docsPatch: { stock_state: "Onhand" } });
    expect(planSettle("status", "list", { listValue: "", docsValue: "Sold / SOLD" })).toHaveProperty("error");
  });
  it("only lets a person note the items that are not a difference", () => {
    expect(choicesFor("docs_code", false)).toEqual(["noted"]);
    expect(planSettle("unmatched", "list", { listValue: "X", docsValue: null })).toHaveProperty("error");
    expect(planSettle("docs_code", "noted", { listValue: "C", docsValue: null })).toMatchObject({ decision: "Noted, left as it is" });
  });
});

describe("filling what the Docs Bible left blank", () => {
  const s = normalizeCar(car({ TRANS: "AT", FUEL: "GAS", MILEAGE: "26T KMS", SPAREKEY: "W/SPAREKEY" })).stock!;
  const blankUnit = { year_model: "17", make: "TOYOTA", model_variant: "WIGO E", color: "RED", trans: null, fuel: "", mileage: null, spare_key: null, encumbrance: "N/A", arrival_date: "2026-09-12" };
  it("fills only the blanks, with the price list's words", () => {
    expect(blankFills(s, blankUnit)).toEqual({ trans: "AT", fuel: "GAS", mileage: "26T KMS", spare_key: "W/SPAREKEY" });
  });
  it("never replaces what is there", () => {
    expect(blankFills(s, { ...blankUnit, trans: "MT", fuel: "DIESEL", mileage: "1T KMS", spare_key: "NO" })).toEqual({});
  });
});

describe("a car that is only on the price list", () => {
  const stock = normalizeCar(car({ "PLATE NUMBER": "NU355A", BRAND: "TOYOTA", MAKE: "FORTUNER", YM: 24, COLOR: "BLACK", TRANS: "AT", FUEL: "DSL" })).stock!;
  it("becomes a Docs Bible row with the same words Add a car uses", () => {
    const made = newUnitFromList(stock, "2026-11-19");
    expect(made).toMatchObject({ fields: { plate_no: "NU355A", make: "TOYOTA", model_variant: "FORTUNER", year_model: "24", color: "BLACK", trans: "AT", fuel: "DSL" } });
  });
  it("says what is missing instead of guessing", () => {
    const s2 = normalizeCar(car({ "PLATE NUMBER": "NU355A", COLOR: null })).stock!;
    expect(newUnitFromList(s2, "2026-11-19")).toEqual({ missing: ["color"] });
  });
  it("offers add, link to the right plate, or leave out, and needs a whole plate to link", () => {
    expect(choicesFor("unmatched")).toEqual(["add", "plate", "noted"]);
    expect(planSettle("unmatched", "add", { listValue: "NU355A", docsValue: null })).toMatchObject({ addUnit: true });
    expect(planSettle("unmatched", "plate", { listValue: "NU355A", docsValue: null }, { plate: "nu 35" })).toHaveProperty("error");
    expect(planSettle("unmatched", "plate", { listValue: "NU355A", docsValue: null }, { plate: "nbu 4875" })).toMatchObject({ linkPlate: "NBU4875" });
    expect(planSettle("unmatched", "noted", { listValue: "NU355A", docsValue: null })).toMatchObject({ decision: "Left out: not a car of MAD" });
  });
});

import { announceToday, compareOrDates, orLabel, orStatus } from "@/lib/docsbible/or-expiry";
describe("the OR expiry", () => {
  it("is overdue, soon (30 days) or fine", () => {
    expect(orStatus("2026-11-01", "2026-11-19")).toEqual({ state: "overdue", days: -18 });
    expect(orStatus("2026-12-19", "2026-11-19")).toEqual({ state: "soon", days: 30 });
    expect(orStatus("2026-12-20", "2026-11-19")).toEqual({ state: "ok", days: 31 });
    expect(orStatus(null, "2026-11-19")).toEqual({ state: "unknown", days: null });
  });
  it("says it in words", () => {
    expect(orLabel(orStatus("2026-11-24", "2026-11-19"))).toBe("OR expires in 5 days");
    expect(orLabel(orStatus("2026-11-19", "2026-11-19"))).toBe("OR expires today");
    expect(orLabel(orStatus("2026-11-18", "2026-11-19"))).toBe("OR expired 1 day ago");
  });
  it("tells Documentation at 30, 14, 7, 0 days and every 7 days while late", () => {
    expect([30, 14, 7, 0, -7, -14].every(announceToday)).toBe(true);
    expect([29, 15, 1, -1, -6, 31].some(announceToday)).toBe(false);
  });
  it("fills a blank date when the sheets agree, and asks about a different one", () => {
    expect(compareOrDates("A", null, [{ name: "the price list", date: "2027-01-01", kind: "live" }, { name: "the REMARKS register", date: "2027-01-01", kind: "older" }])[0]).toMatchObject({ kind: "fill", value: "2027-01-01" });
    expect(compareOrDates("A", null, [{ name: "x", date: "2027-01-01" }, { name: "y", date: "2027-02-01" }])[0]).toMatchObject({ kind: "disagree" });
    expect(compareOrDates("A", "2027-01-01", [{ name: "the price list", date: "2026-10-31", kind: "live" }])[0]).toMatchObject({ kind: "differs", docsValue: "2027-01-01" });
  });
  it("lets an older list speak only when its date is later (the Docs Bible is behind)", () => {
    expect(compareOrDates("A", "2027-09-08", [{ name: "the renewal list", date: "2026-09-08", kind: "older" }])).toEqual([]);
    expect(compareOrDates("A", "2026-09-07", [{ name: "the renewal list", date: "2027-09-01", kind: "older" }])[0]).toMatchObject({ kind: "differs" });
  });
});

describe("papers with (the old DOCS column) is one fact of the car record", () => {
  const unit = { year_model: "17", make: "TOYOTA", model_variant: "WIGO E", color: "RED", trans: "MT", fuel: "GAS", spare_key: null, mileage: "108T KMS", encumbrance: null, arrival_date: "2026-09-12", sale_status: "Onhand", vehicle_status: "AVAILABLE", papers_with: null as string | null };
  it("fills a blank record from the price list's code", () => {
    const s = normalizeCar(car({ DOCS: "C", TRANS: "MT", FUEL: "GAS", MILEAGE: "108T KMS" })).stock!;
    expect(blankFills(s, unit)).toEqual({ papers_with: "C" });
  });
  it("never replaces a code in the record, and puts a different one on the Data check with both values", () => {
    const s = normalizeCar(car({ DOCS: "C", TRANS: "MT", FUEL: "GAS", MILEAGE: "108T KMS" })).stock!;
    expect(blankFills(s, { ...unit, papers_with: "L:ORIG ORCR-KAREN" })).toEqual({});
    const d = compareWithDocs(s, { ...unit, papers_with: "L:ORIG ORCR-KAREN" }).find((i) => i.field === "docs_code");
    expect(d).toMatchObject({ listValue: "C", docsValue: "L:ORIG ORCR-KAREN" });
    expect(compareWithDocs(s, { ...unit, papers_with: "c" }).some((i) => i.field === "docs_code")).toBe(false);
  });
  it("lets a person choose between two different codes, and copies the chosen one into papers_with", () => {
    expect(choicesFor("docs_code", true)).toEqual(["list", "docs", "noted"]);
    expect(planSettle("docs_code", "list", { listValue: "C", docsValue: "L:X" })).toMatchObject({ docsPatch: { papers_with: "C" } });
  });
  it("no longer writes papers_with on the stock row", () => {
    const s = normalizeCar(car({ DOCS: "C" })).stock!;
    expect(Object.keys(stockRow(s, "u1", { model: null, color: null, mileage: null, fuel: null, arrivedOn: null, encumbrance: null }, {}))).not.toContain("papers_with");
  });
});
