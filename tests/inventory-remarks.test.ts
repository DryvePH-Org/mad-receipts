import { describe, expect, it } from "vitest";
import { applyStatus, formatStatusText, percentPaid, readStatus, sheetDate } from "@/lib/inventory/remarks";
import type { StatusRef } from "@/lib/inventory/types";

const ref: StatusRef = { receiptNo: "2556", salesperson: "David", percentPaid: 10, date: "11/2" };

describe("formatStatusText", () => {
  it("follows the sheet's style: WORD - NAME M/D, plus the percent paid", () => {
    expect(formatStatusText("Reserved", ref)).toBe("RESERVED - DAVID 11/2 10%");
    expect(formatStatusText("Sold", { ...ref, percentPaid: 100 })).toBe("SOLD - DAVID 11/2 100%");
  });

  it("keeps the name safe for the format", () => {
    expect(formatStatusText("Reserved", { ...ref, salesperson: "maria  clara" })).toContain("- MARIA CLARA 11/2");
    expect(formatStatusText("Reserved", { ...ref, salesperson: "Peña" })).toContain("- PEÑA 11/2");
    expect(formatStatusText("Reserved", { ...ref, salesperson: "Dav|id 2" })).toContain("- DAV ID 11/2");
    expect(formatStatusText("Reserved", { ...ref, salesperson: "" })).toContain("- STAFF 11/2");
    expect(formatStatusText("Reserved", { ...ref, salesperson: "123" })).toContain("- STAFF 11/2");
  });
});

describe("readStatus", () => {
  it.each([
    ["RESERVED - DAVID 11/2", "Reserved"],
    ["reserved - sweet 10/14", "Reserved"],
    ["  RESERVED", "Reserved"],
    ["SOLD - DAVID 11/2 100%", "Sold"],
    ["", "Available"],
    ["FOR REPAIR - 48V BATTERY PACK", "Available"],
    ["BIG BIG DROP", "Available"],
    ["TENTATIVE", "Available"],
    ["PRE-RESERVED BY ELLA", "Available"], // only a leading status word counts
  ])("%j → %s", (remarks, status) => {
    expect(readStatus(remarks)).toBe(status);
  });
});

describe("applyStatus", () => {
  it("reserves an empty cell", () => {
    expect(applyStatus("", "Reserved", ref)).toBe("RESERVED - DAVID 11/2 10%");
    expect(applyStatus("   ", "Reserved", ref)).toBe("RESERVED - DAVID 11/2 10%");
  });

  it("replaces a status staff already wrote in the sheet's own style", () => {
    expect(applyStatus("RESERVED - DAVID 11/2", "Reserved", { ...ref, percentPaid: 30 })).toBe(
      "RESERVED - DAVID 11/2 30%",
    );
    expect(applyStatus("RESERVED - SWEET 10/14", "Sold", { ...ref, percentPaid: 100 })).toBe("SOLD - DAVID 11/2 100%");
    expect(applyStatus("RESERVED - DAVID 11/2 10%", "Sold", { ...ref, percentPaid: 100 })).toBe("SOLD - DAVID 11/2 100%");
    expect(applyStatus("reserved - maria clara 1/15", "Reserved", ref)).toBe("RESERVED - DAVID 11/2 10%");
  });

  it("puts the status in front of another note and keeps the note", () => {
    expect(applyStatus("BIG BIG DROP", "Reserved", ref)).toBe("RESERVED - DAVID 11/2 10% | BIG BIG DROP");
    expect(applyStatus("FOR REPAIR - 48V BATTERY PACK", "Reserved", ref)).toBe(
      "RESERVED - DAVID 11/2 10% | FOR REPAIR - 48V BATTERY PACK",
    );
  });

  it("keeps the note when the status changes later", () => {
    const reserved = applyStatus("BIG BIG DROP", "Reserved", ref);
    const sold = applyStatus(reserved, "Sold", { ...ref, percentPaid: 100 });
    expect(sold).toBe("SOLD - DAVID 11/2 100% | BIG BIG DROP");
    expect(applyStatus(sold, "Available", ref)).toBe("BIG BIG DROP");
  });

  it("Available removes only the status and never other text", () => {
    expect(applyStatus("RESERVED - ELLA 10/31", "Available", ref)).toBe("");
    expect(applyStatus("RESERVED - ELLA 10/31 | FOR REPAIR", "Available", ref)).toBe("FOR REPAIR");
    expect(applyStatus("FOR REPAIR - 48V BATTERY PACK", "Available", ref)).toBe("FOR REPAIR - 48V BATTERY PACK");
    expect(applyStatus("", "Available", ref)).toBe("");
  });

  it("never loses text it does not understand", () => {
    // Not in the sheet's usual shape, so it is treated as a note and kept whole.
    const odd = "RESERVED - DAVID 11/2 FOR REPAIR";
    expect(applyStatus(odd, "Reserved", ref)).toBe(`RESERVED - DAVID 11/2 10% | ${odd}`);
    expect(applyStatus(odd, "Available", ref)).toBe(odd);
    const noDate = "RESERVED PENDING DOCS";
    expect(applyStatus(noDate, "Sold", ref)).toContain(noDate);
    expect(applyStatus(noDate, "Available", ref)).toBe(noDate);
  });

  it("is stable: applying the same status twice gives the same text", () => {
    const once = applyStatus("BIG BIG DROP", "Reserved", ref);
    expect(applyStatus(once, "Reserved", ref)).toBe(once);
  });
});

describe("percentPaid", () => {
  it("is the whole percent of the price paid", () => {
    expect(percentPaid(5_000_000, 50_000_000)).toBe(10);
    expect(percentPaid(25_000_000, 50_000_000)).toBe(50);
    expect(percentPaid(10_000_000, 30_000_000)).toBe(33);
  });

  it("reads 100 only when fully paid, and never 0 once something is paid", () => {
    expect(percentPaid(50_000_000, 50_000_000)).toBe(100);
    expect(percentPaid(49_999_999, 50_000_000)).toBe(99);
    expect(percentPaid(1, 50_000_000)).toBe(1);
    expect(percentPaid(0, 50_000_000)).toBe(0);
    expect(percentPaid(100, 0)).toBe(0);
  });
});

describe("sheetDate", () => {
  it("is month/day in Manila time, without leading zeros", () => {
    expect(sheetDate("2026-11-02T07:30:00Z")).toBe("11/2");
    expect(sheetDate("2026-11-02T17:00:00Z")).toBe("11/3"); // 1 am in Manila the next day
    expect(sheetDate("2026-01-05T00:00:00Z")).toBe("1/5");
  });
});
