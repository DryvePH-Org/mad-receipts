import "server-only";
import type { DriveClient } from "./drive";
import { assertSheetsWritable } from "./freeze";
import type { CellValue, SheetsClient } from "./sheets";

// Google access through an Apps Script web app that runs as a normal Google account
// (apps-script/Code.gs). Used when a service account key can't be created.
// Env: APPS_SCRIPT_URL (the web app's /exec URL) and APPS_SCRIPT_SECRET (same as the script's SECRET). The grokbots are NOT reached through
// this: they have their own settings (GROKBOT_*), so a bot's address can never be mistaken for the Apps Script's.
const TIMEOUT_MS = 25_000;

const bridgeUrl = () => process.env.APPS_SCRIPT_URL;
const bridgeSecret = () => process.env.APPS_SCRIPT_SECRET;

export const appsScriptConfigured = () =>
  Boolean(bridgeUrl() && bridgeSecret());

type Reply<T> = { ok: true; data: T } | { ok: false; code?: number; message?: string };

/** Error from the script. `code` mirrors the HTTP-style codes the Google API clients use. */
export function scriptError(message: string, code?: number): Error {
  return Object.assign(new Error(message), { code });
}

export async function appsScriptCall<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  if (action === "sheets.update" || action === "sheets.append") assertSheetsWritable(); // the freeze: no write to any sheet
  const url = bridgeUrl();
  const secret = bridgeSecret();
  if (!url || !secret) {
    throw new Error("The Google Apps Script bridge is not configured (APPS_SCRIPT_URL, APPS_SCRIPT_SECRET)");
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      // text/plain keeps this a simple request; the script reads the raw body.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret, action, ...params }),
      redirect: "follow", // Apps Script answers through a redirect
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // The URL is a capability, so never include it in errors.
    throw new Error("Could not reach the Google Apps Script bridge. Try again in a moment.");
  }

  const reply = (await response.json().catch(() => null)) as Reply<T> | null;
  if (!reply || typeof reply !== "object" || !("ok" in reply)) {
    // Google returns a login or error page when the web app isn't deployed for "Anyone".
    throw new Error(
      "The Google Apps Script bridge did not answer correctly. Check that it is deployed as a web app that runs as you, with access set to Anyone.",
    );
  }
  if (!reply.ok) throw scriptError(reply.message ?? "The Google Apps Script bridge failed", reply.code);
  return reply.data;
}

export function createAppsScriptSheetsClient(): SheetsClient {
  return {
    getValues: (spreadsheetId, range) =>
      appsScriptCall<string[][]>("sheets.get", { spreadsheetId, range }),
    async updateValues(spreadsheetId, range, values: CellValue[][]) {
      await appsScriptCall("sheets.update", { spreadsheetId, range, values });
    },
    async appendValues(spreadsheetId, range, values: CellValue[][]) {
      await appsScriptCall("sheets.append", { spreadsheetId, range, values });
    },
  };
}

export function createAppsScriptDriveClient(): DriveClient {
  return {
    findFile: (folderId, name) => appsScriptCall<string | null>("drive.find", { folderId, name }),
    uploadFile: (folderId, name, bytes, mimeType) =>
      appsScriptCall<string>("drive.upload", {
        folderId,
        name,
        mimeType,
        base64: Buffer.from(bytes).toString("base64"),
      }),
  };
}

/** Round trip to the script, to check the URL and secret. */
export const pingAppsScript = () => appsScriptCall<string>("ping");
