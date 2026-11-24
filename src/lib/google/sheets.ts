import "server-only";
import { google } from "googleapis";
import { appsScriptConfigured, createAppsScriptSheetsClient } from "./apps-script";
import { GOOGLE_SCOPES, googleAuth } from "./auth";
import { assertSheetsWritable } from "./freeze";

/** The few Sheets calls the app needs, so adapters can be tested with a fake. */
export interface SheetsClient {
  /** Cell values of a range as text, row by row. Empty trailing cells are omitted. */
  getValues(spreadsheetId: string, range: string): Promise<string[][]>;
  /** Writes exactly the given cells, as typed (no formula parsing). */
  updateValues(spreadsheetId: string, range: string, values: CellValue[][]): Promise<void>;
  /** Adds rows after the last row of the tab's table. */
  appendValues(spreadsheetId: string, range: string, values: CellValue[][]): Promise<void>;
}

export type CellValue = string | number;

export function createSheetsClient(): SheetsClient {
  if (appsScriptConfigured()) return createAppsScriptSheetsClient();
  const api = google.sheets({ version: "v4", auth: googleAuth([GOOGLE_SCOPES.sheets]) });
  return {
    async getValues(spreadsheetId, range) {
      const res = await api.spreadsheets.values.get({
        spreadsheetId,
        range,
        valueRenderOption: "FORMATTED_VALUE",
      });
      return (res.data.values ?? []).map((row) => row.map((cell) => String(cell ?? "")));
    },
    async updateValues(spreadsheetId, range, values) {
      assertSheetsWritable();
      await api.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "RAW",
        requestBody: { values },
      });
    },
    async appendValues(spreadsheetId, range, values) {
      assertSheetsWritable();
      await api.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values },
      });
    },
  };
}

