import "server-only";
import { parseCsv } from "@/lib/dashboard/parse";
import { fetchText, listTabInfo } from "@/lib/dashboard/sheets";
import { docsBridge } from "@/lib/docs/bridge";
import { appsScriptConfigured } from "@/lib/google/apps-script";
import { grokbotMissing } from "@/lib/grokbot/client";
import { plateOfFolderName } from "@/lib/docs/bridge";
import { normalizePlate } from "@/lib/rules/plate";
import { createAdminClient } from "@/lib/supabase/admin";
import { carsSheetGid, carsSheetId } from "@/lib/cars/read";
import { docsTabs } from "@/lib/docs/bible-sync";
import { pricelistSheetId, pricelistTab } from "@/lib/docs/pricelist-sync";
import { CHANGELOG_HEADERS, DOCS_BIBLE_HEADERS, errorCells, findHeaders, INVENTORY_HEADERS, PRICELIST_WRITE_HEADERS } from "./headers";

// "Go-live check": everything the workflow depends on, looked at in one place and compared with what it expects, so that when the copies
// (the sheets, the Drive folders) are replaced by the real ones, whatever is different shows up before anyone relies on it. Read only.

export type CheckStatus = "pass" | "warn" | "fail" | "info";
export interface Check { area: string; title: string; status: CheckStatus; detail: string; hint?: string }

const tail = (id: string | undefined) => (id ? `…${id.slice(-6)}` : "not set");
const ok = (area: string, title: string, detail: string): Check => ({ area, title, status: "pass", detail });
const info = (area: string, title: string, detail: string): Check => ({ area, title, status: "info", detail });
const warn = (area: string, title: string, detail: string, hint?: string): Check => ({ area, title, status: "warn", detail, hint });
const fail = (area: string, title: string, detail: string, hint?: string): Check => ({ area, title, status: "fail", detail, hint });
const safe = async (area: string, title: string, run: () => Promise<Check[]>): Promise<Check[]> => { try { return await run(); } catch (e) { return [fail(area, title, e instanceof Error ? e.message.slice(0, 200) : "The check could not run.")]; } };

async function csvOf(id: string, query: string): Promise<string[][]> {
  const text = await fetchText(`https://docs.google.com/spreadsheets/d/${id}/${query}`);
  if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('The sheet could not be read. Check that it is shared as "Anyone with the link can view".');
  return parseCsv(text);
}

function settings(): Check[] {
  const e = process.env, A = "Settings";
  const out: Check[] = [];
  out.push(/^https:\/\//.test(e.APP_BASE_URL ?? "") ? ok(A, "App address", e.APP_BASE_URL as string) : fail(A, "App address", e.APP_BASE_URL ? "It must start with https://" : "APP_BASE_URL is not set", "The bots send their answers to this address."));
  const missing = grokbotMissing();
  out.push(missing.length ? fail(A, "Grokbot connection", `Missing: ${missing.join(", ")}`) : ok(A, "Grokbot connection", e.GROKBOT_SCAN_WEBHOOK_URL ? "A scanner and a sheet editor" : "One bot does both jobs"));
  out.push(e.CRON_SECRET ? ok(A, "Scheduled jobs key", "set") : fail(A, "Scheduled jobs key", "CRON_SECRET is not set"));
  out.push(e.DOCS_BIBLE_SHEET_ID ? info(A, "Docs Bible workbook", `ends ${tail(e.DOCS_BIBLE_SHEET_ID)} (the bot's routine must name the same one)`) : fail(A, "Docs Bible workbook", "DOCS_BIBLE_SHEET_ID is not set"));
  out.push(pricelistSheetId() ? info(A, "MAD Pricelist workbook", `ends ${tail(pricelistSheetId())}, tab ${pricelistTab()}`) : warn(A, "MAD Pricelist workbook", "not set: the pricelist is not updated and Car status has nothing to show", "CARS_SHEET_ID"));
  out.push(info(A, "Car status sheet", `ends ${tail(carsSheetId())}, tab number ${carsSheetGid()}`));
  out.push(info(A, "Who reads the photos", (e.DOCS_READER ?? "").toLowerCase() === "grokbot" ? "the grokbot scanner" : "a picture API (Groq or Grok)"));
  const w = (e.SHEETS_WRITES ?? "").trim().toLowerCase();
  out.push(w === "on" ? warn(A, "Writing to Google Sheets", "ON everywhere (the receipts log and the inventory status too)", "Be sure those sheets are the right ones.") : w === "docs" ? info(A, "Writing to Google Sheets", "only the Docs Bible and the pricelist through the sheet editor; the receipts log and the inventory status stay frozen") : info(A, "Writing to Google Sheets", "frozen: nothing is written to any sheet"));
  out.push(e.SYNC_DRIVE_UPLOAD === "1" ? info(A, "Approved ARs in Drive", "filed automatically") : info(A, "Approved ARs in Drive", "not filed (Sales uploads the signed AR)"));
  out.push(e.TELEGRAM_BOT_TOKEN && (e.TELEGRAM_DOCS_CHAT_ID || e.TELEGRAM_CHAT_ID) ? ok(A, "Telegram", e.TELEGRAM_DOCS_CHAT_ID ? "a separate chat for the documents team" : "the main chat") : warn(A, "Telegram", "not configured: no scan, approval or handoff messages will be sent"));
  return out;
}

async function database(): Promise<Check[]> {
  const admin = createAdminClient(), A = "Database";
  const probes: [string, string, string, string][] = [
    ["unit_workflow", "id", "24", "details, approval and handoff"], ["unit_sheet_sync", "plate_no", "26", "sheet sync records"],
    ["grokbot_jobs", "bot, priority, plate_no", "25 and 27", "the grokbot queue"], ["transmittals", "plate_no", "22", "transmittal receipts"],
  ];
  const out: Check[] = [];
  for (const [table, cols, mig, what] of probes) {
    const { error } = await admin.from(table as "unit_workflow").select(table === "unit_workflow" ? "plate_no" : cols).limit(1);
    out.push(error ? fail(A, `Table ${table}`, `missing or out of date (${what})`, `Apply migration ${mig}.`) : ok(A, `Table ${table}`, what));
  }
  return out;
}

async function inventorySheet(): Promise<Check[]> {
  const A = "MAD Pricelist", id = pricelistSheetId() ?? carsSheetId();
  if (!id) return [fail(A, "Inventory tab", "no sheet is set")];
  const rows = await csvOf(id, `export?format=csv&gid=${encodeURIComponent(carsSheetGid())}`);
  const out: Check[] = [];
  const inv = findHeaders(rows, INVENTORY_HEADERS);
  out.push(inv.missing.length ? fail(A, "Car status columns", `Missing in the tab: ${inv.missing.join(", ")}`, `Header row found at row ${inv.rowIndex + 1}. Check the tab number (CARS_SHEET_GID) and the header names.`) : ok(A, "Car status columns", `all found (header on row ${inv.rowIndex + 1})`));
  const wr = findHeaders(rows, PRICELIST_WRITE_HEADERS);
  out.push(wr.missing.length ? fail(A, "Columns the bot writes", `Missing: ${wr.missing.join(", ")}`, "The sheet editor stops with an error rather than guess a column.") : ok(A, "Columns the bot writes", "DOCS, OR EXP, SPAREKEY, ENCUMBRANCE found"));
  const plateCol = rows[inv.rowIndex >= 0 ? inv.rowIndex : 1]?.findIndex((h) => h.replace(/\s+/g, " ").trim().toUpperCase() === "PLATE NUMBER") ?? -1;
  const plates = plateCol >= 0 ? rows.slice(inv.rowIndex + 1).map((r) => normalizePlate(r[plateCol])).filter(Boolean) : [];
  out.push(plates.length ? ok(A, "Cars in the tab", `${plates.length} units`) : fail(A, "Cars in the tab", "no plates were found"));
  const dup = plates.length - new Set(plates).size;
  if (dup) out.push(warn(A, "Repeated plates", `${dup} plate${dup === 1 ? "" : "s"} appear more than once in the tab`, "The bot refuses an ambiguous plate."));
  return out;
}

async function docsBible(): Promise<Check[]> {
  const A = "Docs Bible", id = process.env.DOCS_BIBLE_SHEET_ID?.trim();
  if (!id) return [];
  const out: Check[] = [];
  const tabs = docsTabs();
  const docs = await csvOf(id, `gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tabs.docs)}`);
  const dh = findHeaders(docs, DOCS_BIBLE_HEADERS, 3);
  out.push(dh.missing.length ? fail(A, `${tabs.docs} columns`, `Missing: ${dh.missing.join(", ")}`, `Check the tab name "${tabs.docs}" (DOCS_BIBLE_DOCS_TAB) and the header names.`) : ok(A, `${tabs.docs} columns`, "all found"));
  const col = docs[0]?.findIndex((h) => h.trim().toUpperCase() === "PLATE NO.") ?? -1;
  const units = col >= 0 ? docs.slice(1).filter((r) => normalizePlate(r[col])).length : 0;
  out.push(units ? ok(A, `Units in ${tabs.docs}`, `${units}`) : fail(A, `Units in ${tabs.docs}`, "none: the imported columns may be empty", "If the sheet is a copy, press Allow access on its import cells or paste their values."));
  const errs = errorCells(docs.slice(1), 80);
  if (errs) out.push(warn(A, "Errors in the sheet", `${errs} cells in the first rows show #REF! or similar`, "An import lost its access, or a formula points at a tab that is gone."));
  const log = await csvOf(id, `gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tabs.changelog)}`);
  const ch = findHeaders(log, CHANGELOG_HEADERS, 2);
  out.push(ch.missing.length ? fail(A, "CHANGELOG tab", `Missing: ${ch.missing.join(", ")}`, "Every bot change is logged here.") : ok(A, "CHANGELOG tab", `${Math.max(0, log.length - 1)} entries`));
  try {
    const tabs = (await listTabInfo(id)).map((t) => t.name.trim().toUpperCase());
    const months = tabs.filter((t) => /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/.test(t));
    out.push(months.length ? ok(A, "Monthly tabs", months.join(", ")) : warn(A, "Monthly tabs", "none found", "The handoff entries go into the monthly tab of the sale."));
  } catch { out.push(warn(A, "Monthly tabs", "the list of tabs could not be read")); }
  return out;
}

async function drive(): Promise<Check[]> {
  const A = "Drive folders";
  if (!appsScriptConfigured()) return [info(A, "Drive", "not checked: the Drive connection is not configured on this server")];
  const bridge = docsBridge(), out: Check[] = [];
  const [avail, sold] = await Promise.all([bridge.listFolders("available"), bridge.listFolders("sold")]);
  out.push(avail.length ? ok(A, "Available units", `${avail.length} car folders`) : fail(A, "Available units", "no car folder was found", "Check DOC_AVAILABLE_ID in the Drive connection."));
  out.push(sold.length ? ok(A, "Sold units", `${sold.length} car folders`) : warn(A, "Sold units", "no car folder was found", "Check DOC_SOLD_ID."));
  const noPlate = [...avail, ...sold].filter((f) => !plateOfFolderName(f.name));
  if (noPlate.length) out.push(warn(A, "Folder names", `${noPlate.length} folder${noPlate.length === 1 ? "" : "s"} have no plate in brackets, so the app skips them (e.g. ${noPlate.slice(0, 2).map((f) => f.name).join("; ")})`, "Rename them like 14 Toyota Vios (AAX-3622)."));
  const seen = new Map<string, number>();
  for (const f of [...avail, ...sold]) { const p = plateOfFolderName(f.name); if (p) seen.set(p, (seen.get(p) ?? 0) + 1); }
  const dups = [...seen.values()].filter((n) => n > 1).length;
  if (dups) out.push(warn(A, "Plates with several folders", `${dups}`, "A person chooses the right one in Car documents."));
  return out;
}

export async function runGoLiveChecks(): Promise<Check[]> {
  const parts = await Promise.all([
    Promise.resolve(settings()), safe("Database", "Database", database), safe("MAD Pricelist", "Pricelist", inventorySheet),
    safe("Docs Bible", "Docs Bible", docsBible), safe("Drive folders", "Drive", drive),
  ]);
  return parts.flat();
}
