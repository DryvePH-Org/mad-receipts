import { describe, expect, it } from "vitest";
import { formatPeso, fromCentavos, MAX_CENTAVOS, toCentavos } from "@/lib/rules/money";

describe("toCentavos", () => {
  it.each([
    ["50,000.00", 5_000_000],
    ["₱ 50,000", 5_000_000],
    ["₱50,000", 5_000_000],
    ["P50000", 5_000_000],
    ["p 50,000", 5_000_000],
    ["PHP 1,500.5", 150_050],
    ["50,000.-", 5_000_000],
    ["  450000 ", 45_000_000],
    ["0.05", 5],
    ["0", 0],
  ])("parses %j", (input, expected) => {
    expect(toCentavos(input)).toBe(expected);
  });

  it.each([
    [50000, 5_000_000],
    [1500.5, 150_050],
    [0.1 + 0.2, 30], // float noise is rounded away, not carried
    [19.99, 1999],
  ])("converts number %d pesos", (input, expected) => {
    expect(toCentavos(input)).toBe(expected);
  });

  it.each([null, undefined, "", "abc", "50,000.123", "-500", "1.2.3", "₱", NaN, Infinity, -1])(
    "rejects %j",
    (input) => {
      expect(toCentavos(input)).toBeNull();
    },
  );

  it("rejects amounts too large for numeric(12,2)", () => {
    expect(toCentavos("9999999999.99")).toBe(MAX_CENTAVOS);
    expect(toCentavos("10000000000")).toBeNull();
  });
});

describe("fromCentavos", () => {
  it("formats exactly with two decimals", () => {
    expect(fromCentavos(5_000_000)).toBe("50000.00");
    expect(fromCentavos(150_050)).toBe("1500.50");
    expect(fromCentavos(5)).toBe("0.05");
    expect(fromCentavos(0)).toBe("0.00");
    expect(fromCentavos(-150)).toBe("-1.50");
  });

  it("round-trips with toCentavos", () => {
    for (const c of [0, 1, 99, 100, 123_456, 45_000_000, MAX_CENTAVOS]) {
      expect(toCentavos(fromCentavos(c))).toBe(c);
    }
  });

  it("refuses non-integer centavos", () => {
    expect(() => fromCentavos(1.5)).toThrow(TypeError);
  });
});

describe("formatPeso", () => {
  it("formats for display", () => {
    expect(formatPeso(5_000_000)).toBe("₱50,000");
    expect(formatPeso(45_000_000)).toBe("₱450,000");
    expect(formatPeso(150_050)).toBe("₱1,500.50");
    expect(formatPeso(5)).toBe("₱0.05");
    expect(formatPeso(0)).toBe("₱0");
    expect(formatPeso(123_456_789_00)).toBe("₱123,456,789");
  });
});
