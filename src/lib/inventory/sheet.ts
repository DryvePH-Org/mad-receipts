import "server-only";
import { columnLetter, createSheetsClient, tabRange, type SheetsClient } from "@/lib/google/sheets";
import { normalizePlate } from "@/lib/rules/validate";
import { applyStatus, readStatus } from "./remarks";
import type { InventoryAdapter, InventoryUnit } from "./types";

/** A problem staff can fix in the sheet; the message is safe to show them. */
export class InventoryError extends Error {}

interface SheetConfig {
  spreadsheetId: string;
  tab: string;
  plateColumn: string;
  statusColumn: string;
}

// Optional columns, read only for display on the review screen. Never written.
const BRAND_HEADERS = ["brand"];
const MAKE_HEADERS = ["make/type", "make", "model", "makemodel", "make&model", "unit", "vehicle"];
const COLOR_HEADERS = ["color", "colour"];
const HEADER_SEARCH_ROWS = 10; // the header may sit below a title row

const header = (s: string) => s.toLowerCase().replace(/\s+/g, "");

function configFromEnv(): SheetConfig {
  return {
    spreadsheetId: process.env.INVENTORY_SHEET_ID ?? "",
    tab: process.env.INVENTORY_SHEET_TAB || "INVENTORY 2026",
    plateColumn: process.env.INVENTORY_PLATE_COLUMN || "PLATE NUMBER",
    // Staff keep the status as text in REMARKS, e.g. "RESERVED - DAVID 11/2".
    statusColumn: process.env.INVENTORY_STATUS_COLUMN || "REMARKS",
  };
}

/**
 * The inventory Google Sheet that staff maintain by hand. Every call reads it live
 * (no cache). The only write is the status column's cell of the plate's row (REMARKS), and only
 * the status part of its text: other notes in the cell are kept. Format, other cells and rows
 * are never touched.
 */
export function createSheetInventory(
  options: { client?: SheetsClient; config?: SheetConfig } = {},
): InventoryAdapter {
  const config = options.config ?? configFromEnv();
  let client = options.client;
  const sheets = () => (client ??= createSheetsClient());

  /** Reads the tab and finds the plate's row. Row numbers are 1-based, as in the sheet. */
  async function findRow(plate: string) {
    const wanted = normalizePlate(plate);
    const rows = await withFriendlyErrors(() =>
      sheets().getValues(config.spreadsheetId, tabRange(config.tab)),
    );

    const headerIndex = rows
      .slice(0, HEADER_SEARCH_ROWS)
      .findIndex((row) => row.some((cell) => header(cell) === header(config.plateColumn)));
    if (headerIndex === -1) {
      throw new InventoryError(
        `Column "${config.plateColumn}" was not found in the "${config.tab}" tab of the inventory sheet.`,
      );
    }
    const headers = rows[headerIndex].map(header);
    const plateCol = headers.indexOf(header(config.plateColumn));
    const statusCol = headers.indexOf(header(config.statusColumn));
    if (statusCol === -1) {
      throw new InventoryError(
        `Column "${config.statusColumn}" was not found in the "${config.tab}" tab of the inventory sheet.`,
      );
    }
    const brandCol = headers.findIndex((h) => BRAND_HEADERS.includes(h));
    const makeCol = headers.findIndex((h, i) => i !== brandCol && MAKE_HEADERS.includes(h));
    const colorCol = headers.findIndex((h) => COLOR_HEADERS.includes(h));

    const matches: number[] = [];
    rows.forEach((row, i) => {
      if (i > headerIndex && normalizePlate(row[plateCol]) === wanted) matches.push(i);
    });
    if (matches.length > 1) {
      throw new InventoryError(
        `Plate ${wanted} appears on more than one row of the inventory sheet (rows ${matches
          .map((i) => i + 1)
          .join(", ")}). Remove the extra row first.`,
      );
    }
    if (matches.length === 0) return null;

    const row = rows[matches[0]];
    const cell = (col: number) => (col >= 0 ? (row[col] ?? "").trim() : "");
    const remarks = cell(statusCol);
    const unit: InventoryUnit = { plate: wanted, status: readStatus(remarks) };
    if (remarks) unit.remarks = remarks;
    const makeType = [cell(brandCol), cell(makeCol)].filter(Boolean).join(" ");
    if (makeType) unit.makeType = makeType;
    if (cell(colorCol)) unit.color = cell(colorCol);

    return { rowNumber: matches[0] + 1, statusCol, remarks, unit };
  }

  return {
    async getUnit(plate) {
      if (!normalizePlate(plate)) return null;
      return (await findRow(plate))?.unit ?? null;
    },

    async setStatus(plate, status, ref) {
      // Look the row up again at write time: staff may have sorted or edited the sheet.
      const found = await findRow(plate);
      if (!found) throw new InventoryError(`Plate ${normalizePlate(plate)} is no longer in the inventory sheet.`);

      const next = applyStatus(found.remarks, status, ref);
      if (next === found.remarks) return; // already says the right thing: leave the cell alone

      const cell = `${columnLetter(found.statusCol)}${found.rowNumber}`;
      await withFriendlyErrors(() =>
        sheets().updateValues(config.spreadsheetId, tabRange(config.tab, cell), [[next]]),
      );
    },
  };
}

async function withFriendlyErrors<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof InventoryError) throw err;
    const code = Number((err as { code?: unknown; status?: unknown }).code ?? (err as { status?: unknown }).status);
    if (code === 403) {
      throw new InventoryError("The app can't open the inventory sheet. The connected Google account needs Editor access to it, and its id must be allowed in the Apps Script (if used).");
    }
    if (code === 404) throw new InventoryError("The inventory sheet was not found. Check INVENTORY_SHEET_ID.");
    if (code === 400) throw new InventoryError("The inventory tab name looks wrong. Check INVENTORY_SHEET_TAB.");
    throw err;
  }
}
