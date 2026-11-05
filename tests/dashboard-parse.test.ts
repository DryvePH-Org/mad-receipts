import { describe, expect, it } from "vitest";
import { clean, findColumn, parseCsv, parseMoney, parsePrice, parseSheetDate, people, plateKey, yearOfTab } from "@/lib/dashboard/parse";

describe("money as staff type it", () => {
  it.each([
    ["₱458,000", 458000], ["Php20,000", 20000], ["400K", 400000], ["230k all in", 230000], ["1.2M", 1200000], ["60,000", 60000],
    ["₱302,000.00", 302000], ["15K", 15000], ["10k", 10000], ["290+20k", 310000], ["0", 0], ["Php0", 0],
  ])("%s", (text, want) => expect(parseMoney(text)).toBe(want));
  it("is null for blanks and words", () => {
    for (const t of ["", "  ", "n/a", "ORCR", "-", null, undefined]) expect(parseMoney(t as string)).toBeNull();
  });
});

describe("a car's price, with the usual typos", () => {
  it.each([["460.00", 460000], ["320- Securitybank", 320000], ["1,030M", 1030000], ["₱458,000", 458000], ["400K", 400000], ["1.2M", 1200000], ["25,000,000,000", null]])("%s", (text, want) => expect(parsePrice(text)).toBe(want));
  it("is null for blanks", () => { expect(parsePrice("")).toBeNull(); expect(parsePrice("TBD")).toBeNull(); });
});

describe("dates as staff type them", () => {
  it("reads month-first slashes, month names with the tab's year, and ISO", () => {
    expect(parseSheetDate("11/03/2026", 2026)).toBe("2026-11-03");
    expect(parseSheetDate("8/4/26", 2026)).toBe("2026-08-04");
    expect(parseSheetDate("October 14", 2026)).toBe("2026-10-14");
    expect(parseSheetDate("Nov 2", 2026)).toBe("2026-11-02");
    expect(parseSheetDate("Sept 9", 2026)).toBe("2026-09-09");
    expect(parseSheetDate("December 8, 2025", 2026)).toBe("2025-12-08");
    expect(parseSheetDate("2026-11-03", 2025)).toBe("2026-11-03");
  });
  it("is null for blanks and nonsense", () => {
    for (const t of ["", "soon", "13/45/2026", "Smarch 4", null]) expect(parseSheetDate(t as string, 2026)).toBeNull();
  });
});

describe("small helpers", () => {
  it("plates, names and tab years", () => {
    expect(plateKey(" nkf-4771 ")).toBe("NKF4771");
    expect(people("DAVID, ARON")).toEqual(["DAVID", "ARON"]);
    expect(people("Karen/Camila")).toEqual(["KAREN", "CAMILA"]);
    expect(clean("  a   b ")).toBe("a b");
    expect(yearOfTab("NOVEMBER 2026", 1999)).toBe(2026);
    expect(yearOfTab("Oct2026_Sold", 1999)).toBe(2026);
    expect(yearOfTab("HOLD", 1999)).toBe(1999);
  });
  it("finds a column by its header, ignoring case and spacing", () => {
    expect(findColumn(["", "PLATE NUMBER", "Real Buying"], "plate number")).toBe(1);
    expect(findColumn(["", "PLATE NUMBER", "Real Buying"], "realbuying", "price")).toBe(2);
    expect(findColumn(["a"], "x")).toBe(-1);
  });
  it("reads CSV with quotes, commas and line breaks inside quotes", () => {
    expect(parseCsv('a,"b,c",d\n"x ""y""",,"multi\nline"\n')).toEqual([["a", "b,c", "d"], ['x "y"', "", "multi\nline"]]);
  });
});
