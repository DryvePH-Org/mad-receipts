import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

// Runs the real apps-script/Code.gs (car-documents actions) against a fake Drive with Available and Sold folders.
const SECRET = "test-secret";
type Reply = { ok: boolean; data?: any; code?: number; message?: string }; // eslint-disable-line @typescript-eslint/no-explicit-any

interface FolderNode { id: string; name: string; parent: FolderNode | null; folders: FolderNode[]; files: FileNode[] }
interface FileNode { id: string; name: string; mime: string; size: number; parent: FolderNode; bytes: number[] }

function build() {
  const nodes = new Map<string, FolderNode>(), files = new Map<string, FileNode>();
  let n = 0;
  const folder = (name: string, parent: FolderNode | null, id = `f${++n}`): FolderNode => {
    const f: FolderNode = { id, name, parent, folders: [], files: [] };
    parent?.folders.push(f); nodes.set(id, f); return f;
  };
  const file = (name: string, parent: FolderNode, mime = "image/jpeg", size = 1000): FileNode => {
    const f: FileNode = { id: `file${++n}`, name, mime, size, parent, bytes: [1, 2, 3] };
    parent.files.push(f); files.set(f.id, f); return f;
  };
  const available = folder("Available Units", null, "AV"), sold = folder("Sold Units", null, "SO"), elsewhere = folder("Private", null, "PR");
  const vios = folder("14 Toyota Vios (AAX-3622)", available);
  const sonic = folder("15 Chevrolet Sonic (NDS1331)", available);
  const escape = folder("13 Ford Escape (WMO752)", sold);
  const secret = folder("99 Secret (ZZZ9999)", elsewhere);
  file("IMG_1.HEIC", vios, "image/heic", 3_000_000); file("scan.pdf", vios, "application/pdf", 900_000);
  const sub = folder("After sale", vios); file("buyer.jpg", sub);
  file("IMG_9.jpg", escape);
  return { nodes, files, available, sold, vios, sonic, escape, secret, folder, file };
}

const wrapFolder = (f: FolderNode, tree: ReturnType<typeof build>): any => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
  getId: () => f.id, getName: () => f.name, getUrl: () => `https://drive/${f.id}`,
  getParents: () => iter(f.parent ? [wrapFolder(f.parent, tree)] : []),
  getFolders: () => iter(f.folders.map((x) => wrapFolder(x, tree))),
  searchFolders: (q: string) => { const m = /title contains '(.*)'/.exec(q); return iter(f.folders.filter((x) => x.name.includes(m![1])).map((x) => wrapFolder(x, tree))); },
  getFoldersByName: (name: string) => iter(f.folders.filter((x) => x.name === name).map((x) => wrapFolder(x, tree))),
  getFiles: () => iter(f.files.map((x) => wrapFile(x, tree))),
  createFile: (blob: { name: string; bytes: number[] }) => { const x: FileNode = { id: `new${f.files.length}`, name: blob.name, mime: "image/jpeg", size: blob.bytes.length, parent: f, bytes: blob.bytes }; f.files.push(x); tree.files.set(x.id, x); return wrapFile(x, tree); },
  createFolder: (name: string) => { const x: FolderNode = { id: `nf${tree.nodes.size}`, name, parent: f, folders: [], files: [] }; f.folders.push(x); tree.nodes.set(x.id, x); return wrapFolder(x, tree); },
  moveTo: (dest: any) => { f.parent!.folders = f.parent!.folders.filter((x) => x !== f); const d = tree.nodes.get(dest.getId())!; d.folders.push(f); f.parent = d; return wrapFolder(f, tree); }, // eslint-disable-line @typescript-eslint/no-explicit-any
});
const wrapFile = (x: FileNode, tree: ReturnType<typeof build>): any => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
  getId: () => x.id, getName: () => x.name, getMimeType: () => x.mime, getSize: () => x.size, getUrl: () => `https://drive/file/${x.id}`,
  getDateCreated: () => new Date("2026-10-27T00:00:00Z"), getParents: () => iter([wrapFolder(x.parent, tree)]),
  getBlob: () => ({ getBytes: () => x.bytes }),
});
function iter<T>(items: T[]) { let i = 0; return { hasNext: () => i < items.length, next: () => items[i++] }; }

function setup(props: Record<string, string> = {}) {
  const tree = build();
  const properties: Record<string, string> = { SECRET, DOC_AVAILABLE_ID: "AV", DOC_SOLD_ID: "SO", ...props };
  const fetched: string[] = [];
  const sandbox: Record<string, unknown> = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => properties[k] ?? null }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    DriveApp: {
      getFolderById: (id: string) => { const f = tree.nodes.get(id); if (!f) throw new Error("No item with the given ID could be found"); return wrapFolder(f, tree); },
      getFileById: (id: string) => { const f = tree.files.get(id); if (!f) throw new Error("No item with the given ID could be found"); return wrapFile(f, tree); },
    },
    ScriptApp: { getOAuthToken: () => "token" },
    UrlFetchApp: {
      fetch: (url: string) => {
        fetched.push(url);
        if (url.includes("fields=thumbnailLink")) return { getContentText: () => JSON.stringify({ thumbnailLink: "https://lh3/thumb=s220" }) };
        return { getResponseCode: () => 200, getContent: () => [9, 9, 9] };
      },
    },
    Utilities: {
      base64Decode: (s: string) => [...Buffer.from(s, "base64")],
      base64Encode: (b: number[]) => Buffer.from(b).toString("base64"),
      newBlob: (bytes: number[], mime: string, name: string) => ({ bytes, mime, name }),
    },
  };
  runInNewContext(readFileSync(fileURLToPath(new URL("../apps-script/Code.gs", import.meta.url)), "utf8"), sandbox);
  const call = (body: Record<string, unknown>): Reply => JSON.parse((sandbox.doPost as (e: unknown) => { text: string })({ postData: { contents: JSON.stringify({ secret: SECRET, ...body }) } }).text);
  return { call, tree, fetched };
}

let s: ReturnType<typeof setup>;
beforeEach(() => { s = setup(); });

describe("making a car folder", () => {
  it("creates the folder in Available, named with the plate, and says it is new", () => {
    const r = s.call({ action: "docs.createFolder", name: "21 Toyota Vios (ABC-1234)" });
    expect(r).toMatchObject({ ok: true, data: { name: "21 Toyota Vios (ABC-1234)", root: "available", created: true } });
    expect(s.tree.available.folders.map((f) => f.name)).toContain("21 Toyota Vios (ABC-1234)");
  });
  it("returns the folder that already has the plate, in Available or in Sold, instead of making another", () => {
    const a = s.call({ action: "docs.createFolder", name: "14 Toyota Vios (AAX 3622)" });
    expect(a.data).toMatchObject({ id: s.tree.vios.id, created: false });
    expect(s.call({ action: "docs.createFolder", name: "Ford Escape (WMO-752)" }).data).toMatchObject({ id: s.tree.escape.id, root: "sold", created: false });
    expect(s.tree.available.folders).toHaveLength(2);
  });
  it("refuses a name without a plate, and several folders with the same plate", () => {
    expect(s.call({ action: "docs.createFolder", name: "Toyota Vios" })).toMatchObject({ ok: false, code: 400 });
    expect(s.call({ action: "docs.createFolder", name: "(A1)" })).toMatchObject({ ok: false, code: 400 });
    s.tree.folder("14 Toyota Vios (AAX 3622) copy", s.tree.available);
    expect(s.call({ action: "docs.createFolder", name: "Vios (AAX3622)" })).toMatchObject({ ok: false, code: 409 });
  });
  it("cleans slashes and line breaks out of the name", () => {
    expect(s.call({ action: "docs.createFolder", name: "22 Honda/City\n(NBA 1234)" }).data.name).toBe("22 Honda City (NBA 1234)");
  });
});

describe("finding and listing", () => {
  it("lists the car folders of Available and of Sold", () => {
    expect(s.call({ action: "docs.listFolders", root: "available" }).data.map((f: { name: string }) => f.name)).toEqual(["14 Toyota Vios (AAX-3622)", "15 Chevrolet Sonic (NDS1331)"]);
    expect(s.call({ action: "docs.listFolders", root: "sold" }).data).toHaveLength(1);
  });
  it("finds a folder by plate, ignoring dashes, spaces and case, and says where it is", () => {
    for (const plate of ["AAX-3622", "aax 3622", "AAX3622"]) {
      expect(s.call({ action: "docs.findFolder", plate }).data).toMatchObject([{ id: s.tree.vios.id, root: "available" }]);
    }
    expect(s.call({ action: "docs.findFolder", plate: "WMO752" }).data).toMatchObject([{ id: s.tree.escape.id, root: "sold" }]);
    expect(s.call({ action: "docs.findFolder", plate: "ABC1234" }).data).toEqual([]);
    expect(s.call({ action: "docs.findFolder", plate: "A1" })).toMatchObject({ ok: false, code: 400 });
  });
  it("reports several folders for the same plate instead of choosing", () => {
    s.tree.folder("14 Toyota Vios (AAX 3622) copy", s.tree.available);
    expect(s.call({ action: "docs.findFolder", plate: "AAX3622" }).data).toHaveLength(2);
  });
  it("lists the files of a car folder and of its sub-folders", () => {
    const r = s.call({ action: "docs.listFiles", folderId: s.tree.vios.id }).data;
    expect(r.root).toBe("available");
    expect(r.files.map((f: { name: string }) => f.name)).toEqual(["IMG_1.HEIC", "scan.pdf", "After sale/buyer.jpg"]);
  });
});

describe("only inside Available and Sold", () => {
  it("refuses folders and files elsewhere in the Drive", () => {
    expect(s.call({ action: "docs.listFiles", folderId: s.tree.secret.id })).toMatchObject({ ok: false, code: 403 });
    expect(s.call({ action: "docs.upload", folderId: "PR", name: "x.jpg", base64: "AAAA" })).toMatchObject({ ok: false, code: 403 });
    expect(s.call({ action: "docs.move", folderId: s.tree.secret.id })).toMatchObject({ ok: false, code: 403 });
    s.tree.file("hidden.jpg", s.tree.secret);
    const hidden = [...s.tree.files.values()].find((f) => f.name === "hidden.jpg")!;
    expect(s.call({ action: "docs.preview", fileId: hidden.id })).toMatchObject({ ok: false, code: 403 });
  });
  it("needs the two folder ids set", () => {
    expect(setup({ DOC_SOLD_ID: "" }).call({ action: "docs.listFolders", root: "sold" })).toMatchObject({ ok: false, code: 400 });
  });
  it("still needs the secret", () => {
    expect(s.call({ secret: "no", action: "docs.listFolders" })).toMatchObject({ ok: false, code: 401 });
  });
});

describe("upload and preview", () => {
  it("puts a photo in the car folder", () => {
    const r = s.call({ action: "docs.upload", folderId: s.tree.vios.id, name: "a.jpg", mimeType: "image/jpeg", base64: Buffer.from([5, 6]).toString("base64") });
    expect(r.ok).toBe(true);
    expect(s.tree.vios.files.map((f) => f.name)).toContain("a.jpg");
    expect(s.call({ action: "docs.upload", folderId: s.tree.vios.id, name: "a.jpg", base64: "" })).toMatchObject({ ok: false, code: 400 });
  });
  it("gives a normal photo as it is, and a HEIC or PDF through Google's preview", () => {
    s.tree.file("ok.jpg", s.tree.vios);
    const jpg = [...s.tree.files.values()].find((f) => f.name === "ok.jpg")!;
    expect(s.call({ action: "docs.preview", fileId: jpg.id }).data).toMatchObject({ mimeType: "image/jpeg", via: "file" });
    const heic = [...s.tree.files.values()].find((f) => f.name === "IMG_1.HEIC")!;
    const r = s.call({ action: "docs.preview", fileId: heic.id, size: 1600 });
    expect(r.data).toMatchObject({ mimeType: "image/jpeg", via: "preview" });
    expect(s.fetched.at(-1)).toContain("thumb=s1600");
  });
});

describe("move to Sold", () => {
  it("moves the whole folder, files included, from Available to Sold", () => {
    const r = s.call({ action: "docs.move", folderId: s.tree.vios.id });
    expect(r.data).toMatchObject({ id: s.tree.vios.id, root: "sold" });
    expect(s.tree.available.folders.map((f) => f.name)).toEqual(["15 Chevrolet Sonic (NDS1331)"]);
    expect(s.tree.sold.folders.map((f) => f.name)).toContain("14 Toyota Vios (AAX-3622)");
    expect(s.tree.vios.files).toHaveLength(2); // nothing left behind
  });
  it("refuses a folder already in Sold, and a name that Sold already has", () => {
    expect(s.call({ action: "docs.move", folderId: s.tree.escape.id })).toMatchObject({ ok: false, code: 409 });
    s.tree.folder("15 Chevrolet Sonic (NDS1331)", s.tree.sold);
    expect(s.call({ action: "docs.move", folderId: s.tree.sonic.id })).toMatchObject({ ok: false, code: 409 });
    expect(s.tree.available.folders.map((f) => f.name)).toContain("15 Chevrolet Sonic (NDS1331)"); // not moved
  });
  it("only moves a car folder, not a sub-folder inside it", () => {
    const sub = s.tree.vios.folders[0];
    expect(s.call({ action: "docs.move", folderId: sub.id })).toMatchObject({ ok: false, code: 409 });
  });
});
