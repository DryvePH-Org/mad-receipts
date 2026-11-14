import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppsScriptSheetsClient } from "@/lib/google/apps-script";
import { assertSheetsWritable, sheetsFrozen, SheetsFrozenError } from "@/lib/google/freeze";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("the Google Sheets freeze", () => {
  it("is on unless SHEETS_WRITES is on, and any other value keeps it frozen", () => {
    vi.stubEnv("SHEETS_WRITES", "");
    expect(sheetsFrozen()).toBe(true);
    vi.stubEnv("SHEETS_WRITES", "off");
    expect(sheetsFrozen()).toBe(true);
    vi.stubEnv("SHEETS_WRITES", "ON");
    expect(sheetsFrozen()).toBe(false);
  });
  it("has a docs-only setting: the Docs Bible may be written, the receipts log and inventory may not", () => {
    vi.stubEnv("SHEETS_WRITES", "docs");
    expect(sheetsFrozen("docs")).toBe(false);
    expect(sheetsFrozen("app")).toBe(true);
    expect(() => assertSheetsWritable("app")).toThrow(SheetsFrozenError);
    expect(() => assertSheetsWritable("docs")).not.toThrow();
    vi.stubEnv("SHEETS_WRITES", "");
    expect(sheetsFrozen("docs")).toBe(true);
    vi.stubEnv("SHEETS_WRITES", "on");
    expect(sheetsFrozen("docs")).toBe(false);
    expect(sheetsFrozen("app")).toBe(false);
  });
  it("stops every write to a sheet before anything is sent, but reading still works", async () => {
    vi.stubEnv("SHEETS_WRITES", "");
    vi.stubEnv("APPS_SCRIPT_URL", "https://gateway.example.test/hook");
    vi.stubEnv("APPS_SCRIPT_SECRET", "s");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: [["A"]] })));
    vi.stubGlobal("fetch", fetchMock);
    const client = createAppsScriptSheetsClient();
    await expect(client.updateValues("sheet", "'Tab'!A1", [["x"]])).rejects.toBeInstanceOf(SheetsFrozenError);
    await expect(client.appendValues("sheet", "'Tab'", [["x"]])).rejects.toThrow(/frozen/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await client.getValues("sheet", "'Tab'")).toEqual([["A"]]); // reading is not frozen
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("writes again once it is switched on", async () => {
    vi.stubEnv("SHEETS_WRITES", "on");
    vi.stubEnv("APPS_SCRIPT_URL", "https://gateway.example.test/hook");
    vi.stubEnv("APPS_SCRIPT_SECRET", "s");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, data: null }))));
    expect(() => assertSheetsWritable()).not.toThrow();
    await expect(createAppsScriptSheetsClient().appendValues("sheet", "'Tab'", [["x"]])).resolves.toBeUndefined();
  });
});
