import { beforeEach, describe, expect, it } from "vitest";
import { columnLetter, tabRange } from "@/lib/google/sheets";
import { createMockInventory } from "@/lib/inventory/mock";
import { createSheetInventory, InventoryError } from "@/lib/inventory/sheet";
import type { StatusRef } from "@/lib/inventory/types";
import { fakeSheets } from "./fakes";

// The layout of the real "INVENTORY 2026" tab: title row, header on row 2, section rows
// (HATCHBACK, SEDAN...) without a plate, and status written as text in REMARKS (column S).
const HEADER = [
  "DOCS", "OR EXP", "SPAREKEY", "", "NO. OF DAYS IN THE INVENTORY", "YM", "BRAND", "MAKE", "COLOR", "MILEAGE",
  "TRANS", "FUEL", "PLATE NUMBER", "PRICE", "TARGET", "DATE ARRIVED", "REPRICE", "RE-TARGET", "REMARKS",
  "ENCUMBRANCE", "TOOLS", "LOCATION", "", "11/3/2026",
];
const REMARKS_COL = HEADER.indexOf("REMARKS"); // 18 → column S

/** A unit row as the bridge returns it: trailing empty cells left out. */
function unit(plate: string, remarks: string, brand: string, make: string, color: string): string[] {
  const row = new Array<string>(HEADER.length).fill("");
  row[6] = brand;
  row[7] = make;
  row[8] = color;
  row[12] = plate;
  row[REMARKS_COL] = remarks;
  while (row.length && row[row.length - 1] === "") row.pop();
  return row;
}

const config = { spreadsheetId: "sheet-id", tab: "INVENTORY 2026", plateColumn: "PLATE NUMBER", statusColumn: "REMARKS" };
const ref: StatusRef = { receiptNo: "2556", salesperson: "David", percentPaid: 10, date: "11/2" };

let sheet: ReturnType<typeof fakeSheets>;
let grid: string[][];
let inventory: ReturnType<typeof createSheetInventory>;
const remarksOf = (plate: string) => grid.find((r) => r[12] === plate)?.[REMARKS_COL];

beforeEach(() => {
  grid = [
    ["F", "1"], // title row above the header
    HEADER,
    ["", "", "", "0", "HATCHBACK"], // section row: no plate
    unit("NKU8411", "", "SUZUKI", "SPRESSO 1.0 AGS", "GRAY"),
    unit("NBU4875", "BIG BIG DROP", "TOYOTA", "WIGO E", "RED"),
    ["", "", "", "0", "SEDAN"],
    unit("NKH7462", "RESERVED - DAVID 11/2", "MITSUBISHI", "MIRAGE G4 GLX 1.2G CVT", "RED METALLIC"),
    unit("NEW7902", "FOR REPAIR - 48V BATTERY PACK", "BYD", "DOLPHIN", "WHITE"),
    unit("ZY238A", "", "TOYOTA", "HILUX TAMARAW FX", "SUPER WHITE"),
  ];
  sheet = fakeSheets({ "INVENTORY 2026": grid });
  inventory = createSheetInventory({ client: sheet.client, config });
});

describe("getUnit", () => {
  it("finds a unit by plate, normalizing both sides, and shows brand + model", async () => {
    expect(await inventory.getUnit("nku-8411")).toEqual({
      plate: "NKU8411",
      status: "Available",
      makeType: "SUZUKI SPRESSO 1.0 AGS",
      color: "GRAY",
    });
    expect(await inventory.getUnit("zy 238a")).toMatchObject({ plate: "ZY238A", color: "SUPER WHITE" });
  });

  it("reads Reserved from the REMARKS text and shows the whole note", async () => {
    expect(await inventory.getUnit("NKH7462")).toMatchObject({
      status: "Reserved",
      remarks: "RESERVED - DAVID 11/2",
    });
  });

  it("treats other notes as Available but still shows them", async () => {
    expect(await inventory.getUnit("NBU4875")).toMatchObject({ status: "Available", remarks: "BIG BIG DROP" });
    expect(await inventory.getUnit("NEW7902")).toMatchObject({ status: "Available", remarks: "FOR REPAIR - 48V BATTERY PACK" });
  });

  it("returns null for unknown plates, blanks and section rows", async () => {
    expect(await inventory.getUnit("NKF4991")).toBeNull();
    expect(await inventory.getUnit("  ")).toBeNull();
    expect(await inventory.getUnit("HATCHBACK")).toBeNull();
  });

  it("never caches: hand edits show on the next read", async () => {
    expect((await inventory.getUnit("NKU8411"))?.status).toBe("Available");
    grid[3][REMARKS_COL] = "RESERVED - ELLA 11/3"; // staff edit the sheet by hand
    expect((await inventory.getUnit("NKU8411"))?.status).toBe("Reserved");
    expect(sheet.calls.filter((c) => c.op === "get")).toHaveLength(2);
  });

  it("explains a missing plate or status column", async () => {
    grid[1] = HEADER.map((h) => (h === "PLATE NUMBER" ? "PLATE" : h));
    await expect(inventory.getUnit("NKU8411")).rejects.toThrow(/Column "PLATE NUMBER" was not found/);
    grid[1] = HEADER.map((h) => (h === "REMARKS" ? "NOTES" : h));
    await expect(inventory.getUnit("NKU8411")).rejects.toThrow(/Column "REMARKS" was not found/);
  });

  it("refuses to pick between duplicate rows", async () => {
    grid.push(unit("NKU-8411", "", "SUZUKI", "SPRESSO 1.0 AGS", "GRAY"));
    await expect(inventory.getUnit("NKU8411")).rejects.toThrow(InventoryError);
    await expect(inventory.getUnit("NKU8411")).rejects.toThrow(/rows 4, 10/);
  });

  it("turns Google permission errors into a fixable message", async () => {
    const denied = createSheetInventory({
      config,
      client: {
        getValues: () => Promise.reject(Object.assign(new Error("forbidden"), { code: 403 })),
        updateValues: () => Promise.resolve(),
        appendValues: () => Promise.resolve(),
      },
    });
    await expect(denied.getUnit("NKU8411")).rejects.toThrow(/connected Google account needs Editor access/);
  });
});

describe("setStatus", () => {
  const updates = () => sheet.calls.filter((c) => c.op === "update");

  /** Everything except one cell is unchanged. */
  function expectOnlyChanged(before: string[][], row: number, col: number, value: string) {
    const expected = before.map((r) => [...r]);
    expected[row - 1][col] = value;
    expect(grid).toEqual(expected);
  }

  it("reserves a unit: writes 'RESERVED - NAME M/D %' into REMARKS only", async () => {
    const before = grid.map((r) => [...r]);
    await inventory.setStatus("NKU8411", "Reserved", ref);
    expect(updates()).toEqual([{ op: "update", range: "'INVENTORY 2026'!S4", values: [["RESERVED - DAVID 11/2 10%"]] }]);
    expectOnlyChanged(before, 4, REMARKS_COL, "RESERVED - DAVID 11/2 10%");
  });

  it("marks sold, keeping the sheet's own format and the salesperson", async () => {
    const before = grid.map((r) => [...r]);
    await inventory.setStatus("NKH7462", "Sold", { ...ref, percentPaid: 100 });
    expectOnlyChanged(before, 7, REMARKS_COL, "SOLD - DAVID 11/2 100%");
    expect((await inventory.getUnit("NKH7462"))?.status).toBe("Sold");
  });

  it("keeps another note in the cell", async () => {
    await inventory.setStatus("NBU4875", "Reserved", ref);
    expect(remarksOf("NBU4875")).toBe("RESERVED - DAVID 11/2 10% | BIG BIG DROP");
    await inventory.setStatus("NEW7902", "Reserved", ref);
    expect(remarksOf("NEW7902")).toBe("RESERVED - DAVID 11/2 10% | FOR REPAIR - 48V BATTERY PACK");
  });

  it("cancelling clears only the status", async () => {
    await inventory.setStatus("NKH7462", "Available", ref);
    expect(remarksOf("NKH7462")).toBe("");
    await inventory.setStatus("NBU4875", "Reserved", ref);
    await inventory.setStatus("NBU4875", "Available", ref);
    expect(remarksOf("NBU4875")).toBe("BIG BIG DROP");
  });

  it("does not write when the cell already says the right thing", async () => {
    await inventory.setStatus("NKU8411", "Available", ref); // empty and Available
    await inventory.setStatus("NEW7902", "Available", ref); // a note, still Available
    await inventory.setStatus("NKH7462", "Reserved", { ...ref, percentPaid: 10 }); // changes percent: writes
    expect(updates()).toHaveLength(1);
    await inventory.setStatus("NKH7462", "Reserved", { ...ref, percentPaid: 10 }); // same again: no write
    expect(updates()).toHaveLength(1);
  });

  it("writes into a short row whose REMARKS cell is past the last filled cell", async () => {
    expect(grid[3].length).toBeLessThanOrEqual(REMARKS_COL); // trailing empty cells were left out
    await inventory.setStatus("NKU8411", "Reserved", ref);
    expect(updates()[0].range).toBe(`'INVENTORY 2026'!${columnLetter(REMARKS_COL)}4`);
  });

  it("finds the row again at write time, after staff re-sort the sheet", async () => {
    expect(await inventory.getUnit("NKU8411")).not.toBeNull();
    const moved = grid.splice(3, 1)[0]; // staff move the Spresso to the bottom
    grid.push(moved);
    await inventory.setStatus("NKU8411", "Reserved", ref);
    expect(updates().at(-1)?.range).toBe("'INVENTORY 2026'!S9");
    expect(remarksOf("NKU8411")).toBe("RESERVED - DAVID 11/2 10%");
    expect(remarksOf("NBU4875")).toBe("BIG BIG DROP"); // rows that moved up are untouched
  });

  it("never inserts rows for unknown plates", async () => {
    const before = grid.length;
    await expect(inventory.setStatus("NEW999", "Reserved", ref)).rejects.toThrow(/no longer in the inventory sheet/);
    expect(grid).toHaveLength(before);
    expect(updates()).toHaveLength(0);
  });
});

describe("sheet helpers", () => {
  it("builds A1 ranges", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(18)).toBe("S");
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(701)).toBe("ZZ");
    expect(columnLetter(702)).toBe("AAA");
    expect(tabRange("INVENTORY 2026", "S4")).toBe("'INVENTORY 2026'!S4");
    expect(tabRange("Bob's Cars")).toBe("'Bob''s Cars'");
  });
});

describe("mock inventory", () => {
  it("behaves like the sheet for lookups and status changes, and records what was written", async () => {
    const mock = createMockInventory([{ plate: "NKF 4771", status: "Available" }]);
    expect(await mock.getUnit("nkf-4771")).toMatchObject({ status: "Available" });
    await mock.setStatus("NKF4771", "Sold", ref);
    expect(await mock.getUnit("NKF4771")).toMatchObject({ status: "Sold" });
    expect(mock.changes).toEqual([{ plate: "NKF4771", status: "Sold", ref }]);
    expect(await mock.getUnit("NOPE")).toBeNull();
  });
});
