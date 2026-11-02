import { beforeEach, describe, expect, it } from "vitest";
import { columnLetter, tabRange } from "@/lib/google/sheets";
import { createMockInventory } from "@/lib/inventory/mock";
import { createSheetInventory, InventoryError } from "@/lib/inventory/sheet";
import { fakeSheets } from "./fakes";

function fakeSheet(grid: string[][]) {
  const fake = fakeSheets({ Inventory: grid });
  return { grid, calls: fake.calls, client: fake.client };
}

const config = { spreadsheetId: "sheet-id", tab: "Inventory", plateColumn: "Plate No", statusColumn: "Status" };

let sheet: ReturnType<typeof fakeSheet>;
let inventory: ReturnType<typeof createSheetInventory>;

beforeEach(() => {
  sheet = fakeSheet([
    ["MAD Inventory 2026"], // title row above the header
    ["Stock #", "Make / Type", "Plate No", "Color", "Status", "Notes"],
    ["1", "2021 Honda Civic", "NKF 4771", "Black", "Available", ""],
    ["2", "2019 Toyota Vios", "abc-1234", "White", "Reserved", "deposit"],
    ["3", "2020 Mitsubishi Mirage", "XYZ5678", "", "Sold"],
  ]);
  inventory = createSheetInventory({ client: sheet.client, config });
});

describe("sheet inventory: getUnit", () => {
  it("finds a unit by plate, normalizing both sides", async () => {
    expect(await inventory.getUnit("nkf-4771")).toEqual({
      plate: "NKF4771",
      status: "Available",
      makeType: "2021 Honda Civic",
      color: "Black",
    });
    expect(await inventory.getUnit("ABC 1234")).toMatchObject({ plate: "ABC1234", status: "Reserved" });
  });

  it("leaves optional fields out when blank", async () => {
    expect(await inventory.getUnit("XYZ5678")).toEqual({
      plate: "XYZ5678",
      status: "Sold",
      makeType: "2020 Mitsubishi Mirage",
    });
  });

  it("returns null for unknown or blank plates", async () => {
    expect(await inventory.getUnit("NKF4991")).toBeNull();
    expect(await inventory.getUnit("  ")).toBeNull();
  });

  it("never caches: hand edits show on the next read", async () => {
    expect((await inventory.getUnit("NKF4771"))?.status).toBe("Available");
    sheet.grid[2][4] = "On hold"; // staff edit the sheet by hand
    expect((await inventory.getUnit("NKF4771"))?.status).toBe("On hold");
    expect(sheet.calls.filter((c) => c.op === "get")).toHaveLength(2);
  });

  it("reads the configured tab, quoted", async () => {
    await inventory.getUnit("NKF4771");
    expect(sheet.calls[0].range).toBe("'Inventory'");
  });

  it("explains a missing plate or status column", async () => {
    sheet.grid[1][2] = "Plate";
    await expect(inventory.getUnit("NKF4771")).rejects.toThrow(/Column "Plate No" was not found/);
    sheet.grid[1][2] = "Plate No";
    sheet.grid[1][4] = "State";
    await expect(inventory.getUnit("NKF4771")).rejects.toThrow(/Column "Status" was not found/);
  });

  it("refuses to pick between duplicate rows", async () => {
    sheet.grid.push(["4", "2021 Honda Civic", "NKF-4771", "Black", "Available"]);
    await expect(inventory.getUnit("NKF4771")).rejects.toThrow(InventoryError);
    await expect(inventory.getUnit("NKF4771")).rejects.toThrow(/rows 3, 6/);
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
    await expect(denied.getUnit("NKF4771")).rejects.toThrow(/Share it with the service account as Editor/);
  });
});

describe("sheet inventory: setStatus", () => {
  it("writes only the status cell of the plate's row", async () => {
    await inventory.setStatus("NKF4771", "Reserved", { receiptNo: "2556" });
    const updates = sheet.calls.filter((c) => c.op === "update");
    expect(updates).toEqual([{ op: "update", range: "'Inventory'!E3", values: [["Reserved"]] }]);
    expect(sheet.grid[2]).toEqual(["1", "2021 Honda Civic", "NKF 4771", "Black", "Reserved", ""]);
  });

  it("finds the row again at write time, after staff re-sort the sheet", async () => {
    expect(await inventory.getUnit("NKF4771")).not.toBeNull();
    // Staff move the Civic to the bottom between the read and the write.
    const civic = sheet.grid.splice(2, 1)[0];
    sheet.grid.push(civic);
    await inventory.setStatus("NKF4771", "Sold", { receiptNo: "2557" });
    expect(sheet.calls.at(-1)).toMatchObject({ range: "'Inventory'!E5", values: [["Sold"]] });
    expect(sheet.grid[4][4]).toBe("Sold");
    // The rows that moved up are untouched.
    expect(sheet.grid[2].slice(2, 5)).toEqual(["abc-1234", "White", "Reserved"]);
    expect(sheet.grid[3].slice(2, 5)).toEqual(["XYZ5678", "", "Sold"]);
  });

  it("never inserts rows for unknown plates", async () => {
    const before = sheet.grid.length;
    await expect(inventory.setStatus("NEW999", "Reserved", { receiptNo: "1" })).rejects.toThrow(
      /no longer in the inventory sheet/,
    );
    expect(sheet.grid).toHaveLength(before);
    expect(sheet.calls.some((c) => c.op === "update")).toBe(false);
  });
});

describe("sheet helpers", () => {
  it("builds A1 ranges", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(27)).toBe("AB");
    expect(columnLetter(701)).toBe("ZZ");
    expect(columnLetter(702)).toBe("AAA");
    expect(tabRange("Inventory", "E3")).toBe("'Inventory'!E3");
    expect(tabRange("Bob's Cars")).toBe("'Bob''s Cars'");
  });
});

describe("mock inventory", () => {
  it("behaves like the sheet for lookups and status changes", async () => {
    const mock = createMockInventory([{ plate: "NKF 4771", status: "Available" }]);
    expect(await mock.getUnit("nkf-4771")).toMatchObject({ status: "Available" });
    await mock.setStatus("NKF4771", "Sold", { receiptNo: "1" });
    expect(await mock.getUnit("NKF4771")).toMatchObject({ status: "Sold" });
    expect(await mock.getUnit("NOPE")).toBeNull();
  });
});
