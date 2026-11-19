import { describe, expect, it } from "vitest";
import { buildPriceListRows, daysInStock, rowKind, sellableFlag, type PriceRow } from "@/lib/pricelist/export";
import { identityDifferences, identityOverrides, isTestRow, reviewNotes, normalizeCar, normalizeRenewal, normalizeRepair, spareKeyState, type SnapshotRow } from "@/lib/pricelist/import";

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
    expect(odd.issues[0].kind).toBe("pricelist_odd_value");
  });
  it("keeps an OR expiry that is not a date as typed and puts it on the review list", () => {
    const r = normalizeCar(car({ "OR EXP": "06/012027" }));
    expect(r.stock).toMatchObject({ orExpiry: null, orExpiryRaw: "06/012027" });
    expect(r.issues.map((i) => i.kind)).toContain("pricelist_odd_value");
  });
  it("keeps the DOCS code as typed and puts it on the review list", () => {
    const r = normalizeCar(car({ DOCS: "L:SERJEL" }));
    expect(r.stock?.papersWith).toBe("L:SERJEL");
    expect(r.issues.map((i) => i.kind)).toEqual(["pricelist_docs_code"]);
  });
  it("flags an unusual plate", () => {
    expect(normalizeCar(car({ "PLATE NUMBER": "NU355A" })).issues.map((i) => i.kind)).toContain("pricelist_odd_value");
  });
});

describe("differences with the Docs Bible", () => {
  const unit = { year_model: "17", make: "TOYOTA", model_variant: "WIGO E", color: "RED", trans: "MT", fuel: "GAS", spare_key: null };
  const s = normalizeCar(car({ TRANS: "MT", FUEL: "GAS" })).stock!;
  it("sees no difference when they say the same", () => expect(identityDifferences(s, unit)).toEqual([]));
  it("treats the same things written differently as the same", () => {
    const a = normalizeCar(car({ COLOR: "BLACK", FUEL: "DSL", SPAREKEY: "N/A" })).stock!;
    expect(identityDifferences(a, { ...unit, color: "GALAXY BLACK", fuel: "DIESEL", spare_key: "W/O SPAREKEY" })).toEqual([]);
  });
  it("points out a real disagreement", () => {
    const a = normalizeCar(car({ COLOR: "WHITE", SPAREKEY: "W/SPAREKEY" })).stock!;
    const d = identityDifferences(a, { ...unit, color: "RED", spare_key: "NO SPARE KEY" });
    expect(d.length).toBe(2);
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
  it("asks a person to look at a different arrival date (it decides the days in stock)", () => {
    expect(reviewNotes(s, unit).join(" ")).toContain("Arrival date");
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
