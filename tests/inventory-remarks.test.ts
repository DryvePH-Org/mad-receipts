import { describe, expect, it } from "vitest";
import { applyStatus, formatStatusText, readStatus, sheetDate } from "@/lib/inventory/remarks";
import type { StatusRef } from "@/lib/inventory/types";

const ref: StatusRef = { receiptNo: "2556", people: [{ name: "David", percent: 3 }], date: "11/2" };
const two: StatusRef = {
  ...ref,
  people: [
    { name: "David", percent: 3 },
    { name: "Ella", percent: 1.5 },
  ],
};

describe("formatStatusText", () => {
  it("Reserved shows names only, in the sheet's style", () => {
    expect(formatStatusText("Reserved", ref)).toBe("RESERVED - DAVID 11/2");
    expect(formatStatusText("Reserved", two)).toBe("RESERVED - DAVID ELLA 11/2");
  });

  it("Sold shows each person's own commission percent", () => {
    expect(formatStatusText("Sold", ref)).toBe("SOLD - DAVID 3% 11/2");
    expect(formatStatusText("Sold", two)).toBe("SOLD - DAVID 3% ELLA 1.5% 11/2");
    expect(formatStatusText("Sold", { ...ref, people: [{ name: "David", percent: 2.5 }] })).toBe("SOLD - DAVID 2.5% 11/2");
    expect(formatStatusText("Sold", { ...ref, people: [{ name: "David", percent: 0 }] })).toBe("SOLD - DAVID 0% 11/2");
  });

  it("leaves the percent out when none is known", () => {
    expect(formatStatusText("Sold", { ...ref, people: [{ name: "David", percent: null }] })).toBe("SOLD - DAVID 11/2");
  });

  it("keeps names safe for the format", () => {
    const name = (n: string) => formatStatusText("Reserved", { ...ref, people: [{ name: n, percent: null }] });
    expect(name("maria  clara")).toBe("RESERVED - MARIA CLARA 11/2");
    expect(name("Peña")).toBe("RESERVED - PEÑA 11/2");
    expect(name("Dav|id 2")).toBe("RESERVED - DAV ID 11/2");
    expect(name("")).toBe("RESERVED - STAFF 11/2");
    expect(name("123")).toBe("RESERVED - STAFF 11/2");
    expect(formatStatusText("Reserved", { ...ref, people: [] })).toBe("RESERVED - STAFF 11/2");
  });
});

describe("readStatus", () => {
  it.each([
    ["RESERVED - DAVID 11/2", "Reserved"],
    ["reserved - sweet 10/14", "Reserved"],
    ["  RESERVED", "Reserved"],
    ["SOLD - DAVID 3% ELLA 1.5% 11/2", "Sold"],
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
    expect(applyStatus("", "Reserved", ref)).toBe("RESERVED - DAVID 11/2");
    expect(applyStatus("   ", "Reserved", ref)).toBe("RESERVED - DAVID 11/2");
  });

  it("replaces a status staff already wrote in the sheet's own style", () => {
    expect(applyStatus("RESERVED - DAVID 11/2", "Reserved", two)).toBe("RESERVED - DAVID ELLA 11/2");
    expect(applyStatus("RESERVED - SWEET 10/14", "Sold", ref)).toBe("SOLD - DAVID 3% 11/2");
    expect(applyStatus("reserved - maria clara 1/15", "Reserved", ref)).toBe("RESERVED - DAVID 11/2");
    expect(applyStatus("RESERVED - DAVID ELLA 11/2", "Reserved", ref)).toBe("RESERVED - DAVID 11/2");
  });

  it("replaces a SOLD status with percents, whether it came from staff or the app", () => {
    expect(applyStatus("SOLD - DAVID 3% ELLA 1.5% 11/2", "Sold", { ...ref, people: [{ name: "Ella", percent: 4 }] })).toBe(
      "SOLD - ELLA 4% 11/2",
    );
    expect(applyStatus("SOLD - DAVID 3% 11/2", "Available", ref)).toBe("");
  });

  it("puts the status in front of another note and keeps the note", () => {
    expect(applyStatus("BIG BIG DROP", "Reserved", ref)).toBe("RESERVED - DAVID 11/2 | BIG BIG DROP");
    expect(applyStatus("FOR REPAIR - 48V BATTERY PACK", "Reserved", ref)).toBe(
      "RESERVED - DAVID 11/2 | FOR REPAIR - 48V BATTERY PACK",
    );
  });

  it("keeps the note when the status changes later", () => {
    const reserved = applyStatus("BIG BIG DROP", "Reserved", ref);
    const sold = applyStatus(reserved, "Sold", two);
    expect(sold).toBe("SOLD - DAVID 3% ELLA 1.5% 11/2 | BIG BIG DROP");
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
    expect(applyStatus(odd, "Reserved", ref)).toBe(`RESERVED - DAVID 11/2 | ${odd}`);
    expect(applyStatus(odd, "Available", ref)).toBe(odd);
    const noDate = "RESERVED PENDING DOCS";
    expect(applyStatus(noDate, "Sold", ref)).toContain(noDate);
    expect(applyStatus(noDate, "Available", ref)).toBe(noDate);
  });

  it("is stable: applying the same status twice gives the same text", () => {
    const once = applyStatus("BIG BIG DROP", "Sold", two);
    expect(applyStatus(once, "Sold", two)).toBe(once);
  });
});

describe("sheetDate", () => {
  it("is month/day in Manila time, without leading zeros", () => {
    expect(sheetDate("2026-11-02T07:30:00Z")).toBe("11/2");
    expect(sheetDate("2026-11-02T17:00:00Z")).toBe("11/3"); // 1 am in Manila the next day
    expect(sheetDate("2026-01-05T00:00:00Z")).toBe("1/5");
  });
});
