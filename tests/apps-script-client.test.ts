import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appsScriptConfigured,
  createAppsScriptDriveClient,
  createAppsScriptSheetsClient,
  pingAppsScript,
} from "@/lib/google/apps-script";
import { createDriveClient } from "@/lib/google/drive";
import { createSheetsClient } from "@/lib/google/sheets";
import { createSheetInventory } from "@/lib/inventory/sheet";

const URL_ = "https://script.google.com/macros/s/AKfycb-test/exec";

let fetchMock: ReturnType<typeof vi.fn>;
const reply = (body: unknown, init?: ResponseInit) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), init);

beforeEach(() => {
  process.env.APPS_SCRIPT_URL = URL_;
  process.env.APPS_SCRIPT_SECRET = "s3cret";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  delete process.env.APPS_SCRIPT_URL;
  delete process.env.APPS_SCRIPT_SECRET;
  vi.unstubAllGlobals();
});

describe("apps script clients", () => {
  it("is configured only when both env vars are set", () => {
    expect(appsScriptConfigured()).toBe(true);
    delete process.env.APPS_SCRIPT_SECRET;
    expect(appsScriptConfigured()).toBe(false);
  });

  it("uses the BRIDGE_* settings first, so a new gateway can replace the Apps Script by settings alone", async () => {
    process.env.BRIDGE_URL = "https://gateway.example.test/hook";
    process.env.BRIDGE_SECRET = "gw-secret";
    try {
      fetchMock.mockResolvedValue(reply({ ok: true, data: "pong" }));
      await pingAppsScript();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://gateway.example.test/hook");
      expect(JSON.parse(init.body)).toMatchObject({ secret: "gw-secret", action: "ping" });
    } finally { delete process.env.BRIDGE_URL; delete process.env.BRIDGE_SECRET; }
  });

  it("posts the secret and action as JSON, following redirects", async () => {
    fetchMock.mockResolvedValue(reply({ ok: true, data: [["PLATE NUMBER"]] }));
    const rows = await createAppsScriptSheetsClient().getValues("sheet-1", "'Inventory'");
    expect(rows).toEqual([["PLATE NUMBER"]]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(URL_);
    expect(init).toMatchObject({ method: "POST", redirect: "follow" });
    expect(JSON.parse(init.body)).toEqual({
      secret: "s3cret",
      action: "sheets.get",
      spreadsheetId: "sheet-1",
      range: "'Inventory'",
    });
  });

  it("sends update and append writes", async () => {
    fetchMock.mockImplementation(async () => reply({ ok: true, data: null })); // fresh body per call
    const sheets = createAppsScriptSheetsClient();
    await sheets.updateValues("sheet-1", "'Inventory'!B3", [["SOLD"]]);
    await sheets.appendValues("sheet-1", "'Receipts'", [["2556", 50000]]);
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).action)).toEqual(["sheets.update", "sheets.append"]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).values).toEqual([["2556", 50000]]);
  });

  it("sends photos as base64 and returns the Drive file id", async () => {
    fetchMock.mockResolvedValue(reply({ ok: true, data: "file-1" }));
    const id = await createAppsScriptDriveClient().uploadFile("folder-1", "2556_NKF4771.jpg", new Uint8Array([1, 2, 3]), "image/jpeg");
    expect(id).toBe("file-1");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      action: "drive.upload",
      folderId: "folder-1",
      name: "2556_NKF4771.jpg",
      mimeType: "image/jpeg",
      base64: "AQID",
    });
  });

  it("turns script errors into errors with a code, never leaking the URL or secret", async () => {
    fetchMock.mockResolvedValue(reply({ ok: false, code: 403, message: "That file is not allowed." }));
    await expect(createAppsScriptSheetsClient().getValues("x", "'T'")).rejects.toMatchObject({
      message: "That file is not allowed.",
      code: 403,
    });

    fetchMock.mockRejectedValue(new Error(`connect failed ${URL_} s3cret`));
    const err = await pingAppsScript().catch((e: Error) => e);
    expect((err as Error).message).toBe("Could not reach the Google Apps Script bridge. Try again in a moment.");
  });

  it("explains a login or error page instead of JSON", async () => {
    fetchMock.mockResolvedValue(reply("<html>Sign in to Google</html>", { status: 200 }));
    await expect(pingAppsScript()).rejects.toThrow(/access set to Anyone/);
  });

  it("is picked automatically by the Google clients", () => {
    expect(() => createSheetsClient()).not.toThrow();
    expect(() => createDriveClient()).not.toThrow();
    delete process.env.APPS_SCRIPT_URL;
    expect(() => createSheetsClient()).toThrow(/Google is not connected/);
  });

  it("works under the inventory adapter, including its friendly 403", async () => {
    const config = { spreadsheetId: "sheet-1", tab: "Inventory", plateColumn: "PLATE NUMBER", statusColumn: "REMARKS" };
    const inventory = createSheetInventory({ client: createAppsScriptSheetsClient(), config });

    fetchMock.mockResolvedValueOnce(
      reply({ ok: true, data: [["F", "1"], ["PLATE NUMBER", "REMARKS"], ["NKF 4771", "RESERVED - DAVID"]] }),
    );
    expect(await inventory.getUnit("nkf-4771")).toMatchObject({
      plate: "NKF4771",
      status: "Reserved",
      remarks: "RESERVED - DAVID",
    });

    fetchMock.mockResolvedValueOnce(reply({ ok: false, code: 403, message: "That file is not allowed." }));
    await expect(inventory.getUnit("NKF4771")).rejects.toThrow(/Editor access/);
  });
});
