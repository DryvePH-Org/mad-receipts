import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

// Runs the real apps-script/Code.gs against fake Google services.

const SECRET = "test-secret";
const SHEET_ID = "sheet-1";
const OTHER_SHEET_ID = "sheet-not-allowed";
const FOLDER_ID = "folder-1";

type Reply = { ok: boolean; data?: unknown; code?: number; message?: string };

/** A tab as text cells. Like Sheets, it turns unprefixed dates and numbers into other values. */
function fakeTab(initial: string[][]) {
  const grid = initial.map((r) => [...r]);
  const writes: { row: number; col: number; values: unknown[][] }[] = [];
  const stored = (v: unknown) => {
    if (typeof v !== "string") return v;
    if (v.startsWith("'")) return v.slice(1);
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return "11/2/2026"; // auto-parsed to a date
    return v;
  };
  return {
    writes,
    get grid() {
      return grid;
    },
    getDataRange: () => ({
      getDisplayValues: () => {
        const width = Math.max(1, ...grid.map((r) => r.length));
        const rows = Math.max(1, grid.length);
        return Array.from({ length: rows }, (_, i) =>
          Array.from({ length: width }, (_, j) => String(grid[i]?.[j] ?? "")),
        );
      },
    }),
    getLastRow: () => {
      let last = 0;
      grid.forEach((r, i) => r.some((c) => String(c ?? "") !== "") && (last = i + 1));
      return last;
    },
    getRange: (row: number, col: number, nRows: number, nCols: number) => ({
      setValues: (values: unknown[][]) => {
        expect(values).toHaveLength(nRows);
        values.forEach((r) => expect(r).toHaveLength(nCols));
        writes.push({ row, col, values });
        values.forEach((vals, i) => {
          grid[row - 1 + i] ??= [];
          vals.forEach((v, j) => (grid[row - 1 + i][col - 1 + j] = stored(v) as string));
        });
      },
    }),
  };
}

function setup(props: Record<string, string> = {}) {
  const tabs = {
    Inventory: fakeTab([["Title"], ["PLATE NUMBER", "REMARKS"], ["NKF4771", "RESERVED - DAVID"], ["", ""]]),
    Receipts: fakeTab([]),
  };
  const folderFiles = new Map<string, string>([["existing.jpg", "file-existing"]]);
  const created: { name: string; mime: string; bytes: number[] }[] = [];
  let locks = 0;

  const properties: Record<string, string> = {
    SECRET,
    ALLOWED_SHEET_IDS: `${SHEET_ID}, extra-sheet`,
    ALLOWED_FOLDER_IDS: FOLDER_ID,
    ...props,
  };

  const sandbox: Record<string, unknown> = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => properties[k] ?? null }) },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }),
    },
    LockService: {
      getScriptLock: () => ({ waitLock: () => locks++, releaseLock: () => locks-- }),
    },
    SpreadsheetApp: {
      openById: (id: string) => {
        if (id !== SHEET_ID) throw new Error("Unexpected error while getting the method or property openById on object SpreadsheetApp.");
        return { getSheetByName: (name: string) => (tabs as Record<string, unknown>)[name] ?? null };
      },
    },
    DriveApp: {
      getFolderById: () => ({
        getFilesByName: (name: string) => {
          const id = folderFiles.get(name);
          return { hasNext: () => !!id, next: () => ({ getId: () => id }) };
        },
        createFile: (blob: { name: string }) => {
          folderFiles.set(blob.name, "file-new");
          return { getId: () => "file-new" };
        },
      }),
    },
    Utilities: {
      base64Decode: (s: string) => [...Buffer.from(s, "base64")],
      newBlob: (bytes: number[], mime: string, name: string) => {
        created.push({ name, mime, bytes });
        return { name };
      },
    },
  };
  runInNewContext(readFileSync(fileURLToPath(new URL("../apps-script/Code.gs", import.meta.url)), "utf8"), sandbox);

  const call = (body: Record<string, unknown>): Reply =>
    JSON.parse(
      (sandbox.doPost as (e: unknown) => { text: string })({
        postData: { contents: JSON.stringify({ secret: SECRET, ...body }) },
      }).text,
    );
  return { call, tabs, created, locksHeld: () => locks, sandbox, properties };
}

let s: ReturnType<typeof setup>;
beforeEach(() => {
  s = setup();
});

describe("access control", () => {
  it("refuses a missing or wrong secret", () => {
    for (const secret of [undefined, "", "nope", SECRET + "x"]) {
      expect(s.call({ secret, action: "ping" })).toMatchObject({ ok: false, code: 401 });
    }
    expect(s.call({ action: "ping" })).toEqual({ ok: true, data: "pong" });
  });

  it("refuses everything when no SECRET is configured", () => {
    const open = setup({ SECRET: "" });
    expect(open.call({ secret: "", action: "ping" })).toMatchObject({ ok: false, code: 401 });
  });

  it("only reaches allow-listed sheets and folders", () => {
    expect(s.call({ action: "sheets.get", spreadsheetId: OTHER_SHEET_ID, range: "'Inventory'" })).toMatchObject({
      ok: false,
      code: 403,
    });
    expect(s.call({ action: "drive.find", folderId: "other-folder", name: "x.jpg" })).toMatchObject({ ok: false, code: 403 });
    const none = setup({ ALLOWED_SHEET_IDS: "", ALLOWED_FOLDER_IDS: "" });
    expect(none.call({ action: "sheets.get", spreadsheetId: SHEET_ID, range: "'Inventory'" })).toMatchObject({ code: 403 });
  });

  it("rejects unknown actions and garbage bodies", () => {
    expect(s.call({ action: "sheets.delete" })).toMatchObject({ ok: false, code: 400 });
    const raw = JSON.parse((s.sandbox.doPost as (e: unknown) => { text: string })({ postData: { contents: "not json" } }).text);
    expect(raw.ok).toBe(false);
    expect(JSON.parse((s.sandbox.doGet as () => { text: string })().text)).toEqual({
      ok: true,
      data: "MAD Receipts bridge is running",
    });
  });
});

describe("sheets", () => {
  it("reads a tab as text, without trailing empty cells or rows", () => {
    expect(s.call({ action: "sheets.get", spreadsheetId: SHEET_ID, range: "'Inventory'" })).toEqual({
      ok: true,
      data: [["Title"], ["PLATE NUMBER", "REMARKS"], ["NKF4771", "RESERVED - DAVID"]],
    });
  });

  it("returns [] for an empty tab so headers get written", () => {
    expect(s.call({ action: "sheets.get", spreadsheetId: SHEET_ID, range: "'Receipts'" })).toEqual({ ok: true, data: [] });
  });

  it("explains an unknown tab and an inaccessible sheet", () => {
    expect(s.call({ action: "sheets.get", spreadsheetId: SHEET_ID, range: "'Nope'" })).toEqual({
      ok: false,
      code: 400,
      message: 'Tab "Nope" was not found',
    });
    const other = setup({ ALLOWED_SHEET_IDS: OTHER_SHEET_ID });
    expect(other.call({ action: "sheets.get", spreadsheetId: OTHER_SHEET_ID, range: "'Inventory'" })).toMatchObject({ code: 404 });
  });

  it("updates only the addressed cell, and no other cell changes", () => {
    const before = JSON.stringify(s.tabs.Inventory.grid);
    const r = s.call({ action: "sheets.update", spreadsheetId: SHEET_ID, range: "'Inventory'!B3", values: [["SOLD - DAVID"]] });
    expect(r).toEqual({ ok: true, data: null });
    expect(s.tabs.Inventory.writes).toEqual([{ row: 3, col: 2, values: [["SOLD - DAVID"]] }]);
    const after = JSON.parse(before);
    after[2][1] = "SOLD - DAVID";
    expect(s.tabs.Inventory.grid).toEqual(after);
    expect(s.locksHeld()).toBe(0); // lock released
  });

  it("appends below the last row", () => {
    s.call({ action: "sheets.append", spreadsheetId: SHEET_ID, range: "'Inventory'", values: [["ABC1234", "TEST"]] });
    expect(s.tabs.Inventory.writes[0]).toMatchObject({ row: 4, col: 1 }); // after the last row with content
  });

  it("keeps text as typed: dates and receipt numbers are not auto-converted, numbers stay numbers", () => {
    s.call({
      action: "sheets.append",
      spreadsheetId: SHEET_ID,
      range: "'Receipts'",
      values: [["2556", "2026-11-02", "Jose Rizal", 50000, "", "=HYPERLINK(1)"]],
    });
    expect(s.tabs.Receipts.grid[0]).toEqual(["2556", "2026-11-02", "Jose Rizal", 50000, "", "=HYPERLINK(1)"]);
  });

  it("validates input", () => {
    const base = { action: "sheets.update", spreadsheetId: SHEET_ID };
    expect(s.call({ ...base, range: "'Inventory'!B3", values: "x" })).toMatchObject({ code: 400 });
    expect(s.call({ ...base, range: "'Inventory'", values: [["x"]] })).toMatchObject({ code: 400 }); // no start cell
    expect(s.call({ ...base, range: "Inventory!B3", values: [["x"]] })).toMatchObject({ code: 400 });
    expect(s.call({ action: "sheets.get", spreadsheetId: SHEET_ID, range: "'Inventory'!A1" })).toMatchObject({ code: 400 });
  });
});

describe("drive", () => {
  it("finds an existing file by name, or null", () => {
    expect(s.call({ action: "drive.find", folderId: FOLDER_ID, name: "existing.jpg" })).toEqual({ ok: true, data: "file-existing" });
    expect(s.call({ action: "drive.find", folderId: FOLDER_ID, name: "missing.jpg" })).toEqual({ ok: true, data: null });
  });

  it("uploads decoded bytes with the given name and type", () => {
    const base64 = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64");
    expect(
      s.call({ action: "drive.upload", folderId: FOLDER_ID, name: "2556_NKF4771.jpg", mimeType: "image/jpeg", base64 }),
    ).toEqual({ ok: true, data: "file-new" });
    expect(s.created).toEqual([{ name: "2556_NKF4771.jpg", mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff, 0xd9] }]);
  });

  it("rejects empty and oversized files", () => {
    expect(s.call({ action: "drive.upload", folderId: FOLDER_ID, name: "a.jpg", base64: "" })).toMatchObject({ code: 400 });
    expect(
      s.call({ action: "drive.upload", folderId: FOLDER_ID, name: "a.jpg", base64: "A".repeat(15 * 1024 * 1024) }),
    ).toMatchObject({ code: 413 });
  });
});
