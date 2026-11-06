import "server-only";

import { appsScriptCall, appsScriptConfigured } from "@/lib/google/apps-script";

// Voucher photos are copied to Google Drive through MAD's Apps Script bridge (apps-script/Code.gs, action pcf.upload),
// under "<PCF_DRIVE_FOLDER_ID folder> / <fund> / <year-month>". The folder must be listed in the script's
// ALLOWED_FOLDER_IDS. Without PCF_DRIVE_FOLDER_ID, photos stay only in the app.

export function driveConfigured() {
  return appsScriptConfigured() && Boolean(process.env.PCF_DRIVE_FOLDER_ID);
}

// Names become Drive folder/file names.
export function driveSafeName(name: string) {
  return name
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "untitled";
}

type UploadInput = {
  folders: string[];
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer;
};

const DRIVE_URL = /^https:\/\/(drive|docs)\.google\.com\//;

export async function uploadToDrive(input: UploadInput): Promise<{ id: string; url: string }> {
  const result = await appsScriptCall<{ id?: string; url?: string }>("pcf.upload", {
    folderId: process.env.PCF_DRIVE_FOLDER_ID,
    folders: input.folders.map(driveSafeName),
    name: driveSafeName(input.fileName),
    mimeType: input.mimeType,
    base64: Buffer.from(input.bytes).toString("base64"),
  });
  if (!result?.id || !result.url) throw new Error("Drive script refused the upload (no answer)");
  if (!DRIVE_URL.test(result.url)) throw new Error("Drive script returned an unexpected link");
  return { id: result.id, url: result.url };
}
