import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Runs the real apps-script/Code.gs pcf.upload action against a fake Drive.

type Folder = { name: string; children: Map<string, Folder>; files: { name: string; mime: string }[] };
const folder = (name: string): Folder => ({ name, children: new Map(), files: [] });

function setup() {
  const root = folder("Petty cash photos");
  const wrap = (f: Folder): unknown => ({
    getFoldersByName: (name: string) => {
      const found = f.children.get(name);
      return { hasNext: () => !!found, next: () => wrap(found!) };
    },
    createFolder: (name: string) => {
      const child = folder(name);
      f.children.set(name, child);
      return wrap(child);
    },
    createFile: (blob: { name: string; mime: string }) => {
      f.files.push(blob);
      return { getId: () => `id-${blob.name}`, getUrl: () => `https://drive.google.com/file/d/id-${blob.name}/view` };
    },
  });
  const sandbox: Record<string, unknown> = {
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: (k: string) => ({ SECRET: "s", ALLOWED_FOLDER_IDS: "pcf-root" } as Record<string, string>)[k] ?? null }),
    },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    DriveApp: { getFolderById: (id: string) => { if (id !== "pcf-root") throw new Error("not found"); return wrap(root); } },
    Utilities: {
      base64Decode: (s: string) => [...Buffer.from(s, "base64")],
      newBlob: (_bytes: number[], mime: string, name: string) => ({ name, mime }),
    },
  };
  runInNewContext(readFileSync(fileURLToPath(new URL("../../apps-script/Code.gs", import.meta.url)), "utf8"), sandbox);
  const call = (body: Record<string, unknown>) =>
    JSON.parse((sandbox.doPost as (e: unknown) => { text: string })({ postData: { contents: JSON.stringify({ secret: "s", action: "pcf.upload", ...body }) } }).text);
  return { call, root };
}

const base64 = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64");

describe("pcf.upload", () => {
  it("saves the photo under fund and month folders, reusing folders that exist", () => {
    const s = setup();
    const first = s.call({ folderId: "pcf-root", folders: ["Main Fund", "2026-11"], name: "PCV-1.jpg", mimeType: "image/jpeg", base64 });
    expect(first).toEqual({ ok: true, data: { id: "id-PCV-1.jpg", url: "https://drive.google.com/file/d/id-PCV-1.jpg/view" } });
    s.call({ folderId: "pcf-root", folders: ["Main Fund", "2026-11"], name: "PCV-2.jpg", mimeType: "image/png", base64 });
    expect([...s.root.children.keys()]).toEqual(["Main Fund"]);
    expect(s.root.children.get("Main Fund")!.children.get("2026-11")!.files.map((f) => f.name)).toEqual(["PCV-1.jpg", "PCV-2.jpg"]);
  });

  it("cleans folder and file names", () => {
    const s = setup();
    s.call({ folderId: "pcf-root", folders: ["a/b:c"], name: "x​?.jpg", mimeType: "image/jpeg", base64 });
    expect(s.root.children.get("a-b-c")!.files[0].name).toBe("x-.jpg");
  });

  it("only writes into an allowed folder, and only photos", () => {
    const s = setup();
    expect(s.call({ folderId: "elsewhere", folders: [], name: "a.jpg", mimeType: "image/jpeg", base64 })).toMatchObject({ ok: false, code: 403 });
    expect(s.call({ folderId: "pcf-root", folders: [], name: "a.pdf", mimeType: "application/pdf", base64 })).toMatchObject({ ok: false, code: 400 });
    expect(s.call({ folderId: "pcf-root", folders: [], name: "a.jpg", mimeType: "image/jpeg", base64: "" })).toMatchObject({ ok: false, code: 400 });
    expect(s.call({ folderId: "pcf-root", folders: [], name: "a.jpg", mimeType: "image/jpeg", base64: "A".repeat(15 * 1024 * 1024) })).toMatchObject({ ok: false, code: 413 });
    expect(s.call({ secret: "wrong", folderId: "pcf-root", folders: [], name: "a.jpg", mimeType: "image/jpeg", base64 })).toMatchObject({ ok: false, code: 401 });
  });
});
