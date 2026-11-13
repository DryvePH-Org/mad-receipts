import "server-only";
import { appsScriptCall, appsScriptConfigured } from "@/lib/google/apps-script";
import { normalizePlate } from "@/lib/rules/plate";

// The car-documents folders in Drive, reached through the Apps Script bridge (apps-script/Code.gs).

export type Root = "available" | "sold";
export interface DriveFolder { id: string; name: string; url: string; root: Root }
export interface DriveFile { id: string; name: string; mimeType: string; size: number; createdAt: string; url: string }

export interface DocsBridge {
  /** Every car folder directly inside Available or Sold. */
  listFolders(root: Root): Promise<DriveFolder[]>;
  /** Car folders whose name holds this plate, in Available and Sold. One is a match; none or several need a person. */
  findFolder(plate: string): Promise<DriveFolder[]>;
  listFiles(folderId: string): Promise<{ root: Root; files: DriveFile[] }>;
  upload(folderId: string, name: string, bytes: Uint8Array, mimeType: string): Promise<{ id: string; url: string }>;
  /** A picture the reader can use: the file, or Google's preview of it (HEIC photos, scanned PDFs). */
  preview(fileId: string, size?: number): Promise<{ mimeType: string; base64: string }>;
  /** The car folder for this name (it must end with the plate in brackets): the one that already has the plate, or a new one in Available. */
  createFolder(name: string): Promise<DriveFolder & { created: boolean }>;
  /** Moves the whole car folder from Available to Sold. */
  move(folderId: string): Promise<DriveFolder>;
}

/** "14 Toyota Vios (AAX-3622)" → "AAX3622". Null when the name has no plate in brackets. */
export function plateOfFolderName(name: string): string | null {
  const m = /\(([^()]+)\)\s*$/.exec(name.trim());
  const plate = m ? normalizePlate(m[1]) : "";
  return plate.length >= 5 ? plate : null;
}

export function createAppsScriptDocsBridge(): DocsBridge {
  return {
    listFolders: (root) => appsScriptCall<DriveFolder[]>("docs.listFolders", { root }),
    findFolder: (plate) => appsScriptCall<DriveFolder[]>("docs.findFolder", { plate }),
    listFiles: (folderId) => appsScriptCall("docs.listFiles", { folderId }),
    upload: (folderId, name, bytes, mimeType) => appsScriptCall("docs.upload", { folderId, name, mimeType, base64: Buffer.from(bytes).toString("base64") }),
    preview: (fileId, size) => appsScriptCall("docs.preview", { fileId, size }),
    createFolder: (name) => appsScriptCall<DriveFolder & { created: boolean }>("docs.createFolder", { name }),
    move: (folderId) => appsScriptCall<DriveFolder>("docs.move", { folderId }),
  };
}

// ---- a stand-in Drive for local development and the browser tests (never used in production) ----

const PIXEL = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

export function createMockDocsBridge(): DocsBridge {
  const folders: (DriveFolder & { files: DriveFile[] })[] = [];
  let n = 0;
  const add = (name: string, root: Root, files: string[] = []) => {
    const id = `mock-folder-${++n}`;
    folders.push({ id, name, url: `https://drive.example.test/folders/${id}`, root, files: files.map((f) => ({ id: `mock-file-${++n}`, name: f, mimeType: "image/jpeg", size: 1000, createdAt: new Date(2026, 9, 27, 0, 0, n).toISOString(), url: `https://drive.example.test/files/${n}` })) });
  };
  add("23 Toyota Vios (ZZT-7001)", "available", ["cr-or.jpg", "id-Maria_Leonila_Lim.jpg", "deed-dealer.jpg"]);
  add("22 Honda City (ZZT-7002)", "available");
  add("22 Honda City (ZZT 7002) copy", "available");
  add("21 Ford Escape (ZZT-7003)", "sold", ["cr-or.jpg"]);
  return {
    async listFolders(root) { return folders.filter((f) => f.root === root).map(({ files: _f, ...rest }) => (void _f, rest)); },
    async findFolder(plate) {
      const p = normalizePlate(plate);
      return folders.filter((f) => normalizePlate(f.name).includes(p)).map(({ files: _f, ...rest }) => (void _f, rest));
    },
    async listFiles(folderId) {
      const f = folders.find((x) => x.id === folderId);
      if (!f) throw new Error("That folder is not inside the Available or Sold folder");
      return { root: f.root, files: f.files };
    },
    async upload(folderId, name, bytes, mimeType) {
      const f = folders.find((x) => x.id === folderId);
      if (!f) throw new Error("That folder is not inside the Available or Sold folder");
      const id = `mock-file-${++n}`;
      f.files.push({ id, name, mimeType, size: bytes.length, createdAt: new Date().toISOString(), url: `https://drive.example.test/files/${id}` });
      return { id, url: `https://drive.example.test/files/${id}` };
    },
    async createFolder(name) {
      const plate = plateOfFolderName(name);
      if (!plate) throw new Error("The folder name must end with the plate in brackets, like (AAX-3622)");
      const have = folders.filter((f) => normalizePlate(f.name).includes(plate));
      if (have.length > 1) throw Object.assign(new Error("More than one folder already has this plate"), { code: 409 });
      if (have.length === 1) { const { files: _f, ...rest } = have[0]; void _f; return { ...rest, created: false }; }
      add(name, "available");
      const { files: _f, ...rest } = folders[folders.length - 1]; void _f;
      return { ...rest, created: true };
    },
    async preview() { return { mimeType: "image/jpeg", base64: PIXEL }; },
    async move(folderId) {
      const f = folders.find((x) => x.id === folderId);
      if (!f) throw new Error("That folder is not inside the Available or Sold folder");
      if (f.root === "sold") throw Object.assign(new Error("That folder is already in Sold"), { code: 409 });
      if (folders.some((x) => x.root === "sold" && x.name === f.name)) throw Object.assign(new Error(`Sold already has a folder named "${f.name}"`), { code: 409 });
      f.root = "sold";
      const { files: _f, ...rest } = f; void _f;
      return rest;
    },
  };
}

let bridge: DocsBridge | undefined;
/** The real bridge when the Apps Script is configured; a stand-in in development; nothing in production without it. */
export function docsBridge(): DocsBridge {
  if (bridge) return bridge;
  if (appsScriptConfigured() && process.env.DOCS_MOCK !== "1") bridge = createAppsScriptDocsBridge();
  else if (process.env.NODE_ENV !== "production" || process.env.DOCS_MOCK === "1") {
    console.warn("[docs] using the development stand-in for the documents folders");
    bridge = createMockDocsBridge();
  } else throw new Error("The documents folders are not set up: the Apps Script bridge is not configured.");
  return bridge;
}
