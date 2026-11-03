import "server-only";
import { Readable } from "node:stream";
import { google } from "googleapis";
import { appsScriptConfigured, createAppsScriptDriveClient } from "./apps-script";
import { GOOGLE_SCOPES, googleAuth } from "./auth";

export interface DriveClient {
  /** Id of a non-trashed file with this exact name in the folder, or null. */
  findFile(folderId: string, name: string): Promise<string | null>;
  uploadFile(folderId: string, name: string, bytes: Uint8Array, mimeType: string): Promise<string>;
}

export const driveFileLink = (fileId: string) => `https://drive.google.com/file/d/${fileId}/view`;

export function createDriveClient(): DriveClient {
  if (appsScriptConfigured()) return createAppsScriptDriveClient();
  const api = google.drive({ version: "v3", auth: googleAuth([GOOGLE_SCOPES.drive]) });
  return {
    async findFile(folderId, name) {
      const escaped = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
      const res = await api.files.list({
        q: `name = '${escaped}' and '${folderId}' in parents and trashed = false`,
        fields: "files(id)",
        pageSize: 1,
        corpora: "allDrives",
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      });
      return res.data.files?.[0]?.id ?? null;
    },
    async uploadFile(folderId, name, bytes, mimeType) {
      const res = await api.files.create({
        requestBody: { name, parents: [folderId] },
        media: { mimeType, body: Readable.from(Buffer.from(bytes)) },
        fields: "id",
        supportsAllDrives: true,
      });
      if (!res.data.id) throw new Error("Drive did not return a file id");
      return res.data.id;
    },
  };
}
