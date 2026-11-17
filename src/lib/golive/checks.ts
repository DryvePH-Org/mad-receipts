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
import { sheetChangesSinceMove, type MovedRow } from "./cutover";
import { findHeaders, INVENTORY_HEADERS } from "./headers";

const docsTab = () => process.env.DOCS_BIBLE_DOCS_TAB?.trim() || "DOCS 2026";
const pricelistSheetId = () => process.env.PRICELIST_SHEET_ID?.trim() || process.env.CARS_SHEET_ID?.trim() || undefined;

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
  out.push(missing.length ? fail(A, "Scanner bot connection", `Missing: ${missing.join(", ")}`) : ok(A, "Scanner bot connection", "address, key, callback secret and app address are set"));
  out.push(e.CRON_SECRET ? ok(A, "Scheduled jobs key", "set") : fail(A, "Scheduled jobs key", "CRON_SECRET is not set"));
  out.push(e.DOCS_BIBLE_SHEET_ID ? info(A, "Old Docs Bible sheet (watched for changes)", `ends ${tail(e.DOCS_BIBLE_SHEET_ID)}`) : warn(A, "Old Docs Bible sheet", "DOCS_BIBLE_SHEET_ID is not set: the cut-over check cannot look for changes made in the old sheet", "Set it to the live sheet's id (shared \"Anyone with the link can view\")."));
  out.push(info(A, "Car status sheet", `ends ${tail(carsSheetId())}, tab number ${carsSheetGid()}`));
  out.push(info(A, "Who reads the photos", (e.DOCS_READER ?? "").toLowerCase() === "grokbot" ? "the grokbot scanner" : "a picture API (Groq or Grok)"));
  out.push((e.SHEETS_WRITES ?? "").trim().toLowerCase() === "on" ? warn(A, "Writing to Google Sheets", "ON (the receipts log and the inventory status)", "Be sure those sheets are the right ones.") : info(A, "Writing to Google Sheets", "frozen: the receipts log and the inventory status wait (the Docs Bible is in the database and never goes to a sheet)"));
  out.push(e.TELEGRAM_BOT_TOKEN && (e.TELEGRAM_DOCS_CHAT_ID || e.TELEGRAM_CHAT_ID) ? ok(A, "Telegram", e.TELEGRAM_DOCS_CHAT_ID ? "a separate chat for the documents team" : "the main chat") : warn(A, "Telegram", "not configured: no scan, approval or handoff messages will be sent"));
  return out;
}

async function database(): Promise<Check[]> {
  const admin = createAdminClient(), A = "Database";
  const probes: [string, string, string, string][] = [
    ["unit_workflow", "id", "24", "details, approval and handoff"], ["docs_units", "plate_no", "30", "the Docs Bible"], ["docs_review_items", "kind", "30 and 31", "the review list"],
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
  const A = "Car status sheet", id = pricelistSheetId() ?? carsSheetId();
  if (!id) return [fail(A, "Inventory tab", "no sheet is set")];
  const rows = await csvOf(id, `export?format=csv&gid=${encodeURIComponent(carsSheetGid())}`);
  const out: Check[] = [];
  const inv = findHeaders(rows, INVENTORY_HEADERS);
  out.push(inv.missing.length ? fail(A, "Car status columns", `Missing in the tab: ${inv.missing.join(", ")}`, `Header row found at row ${inv.rowIndex + 1}. Check the tab number (CARS_SHEET_GID) and the header names.`) : ok(A, "Car status columns", `all found (header on row ${inv.rowIndex + 1})`));
  const plateCol = rows[inv.rowIndex >= 0 ? inv.rowIndex : 1]?.findIndex((h) => h.replace(/\s+/g, " ").trim().toUpperCase() === "PLATE NUMBER") ?? -1;
  const plates = plateCol >= 0 ? rows.slice(inv.rowIndex + 1).map((r) => normalizePlate(r[plateCol])).filter(Boolean) : [];
  out.push(plates.length ? ok(A, "Cars in the tab", `${plates.length} units`) : fail(A, "Cars in the tab", "no plates were found"));
  const dup = plates.length - new Set(plates).size;
  if (dup) out.push(warn(A, "Repeated plates", `${dup} plate${dup === 1 ? "" : "s"} appear more than once in the tab`, "Car status shows the first one."));
  return out;
}

/** The Docs Bible in the database: the cars, the review list, and today's saved copy. */
async function docsBibleDatabase(): Promise<Check[]> {
  const A = "Docs Bible (database)", db = createAdminClient() as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const cars = await db.from("docs_units_current").select("id", { count: "exact", head: true });
  const open = await db.from("docs_review_items").select("id", { count: "exact", head: true }).eq("status", "open");
  const out: Check[] = [cars.count ? ok(A, "Cars in the Docs Bible", `${cars.count}`) : fail(A, "Cars in the Docs Bible", "none: the data was not moved yet", "Run scripts/docs-bible-apply.ts.")];
  out.push((open.count ?? 0) === 0 ? ok(A, "Review list", "nothing is waiting for a decision") : warn(A, "Review list", `${open.count} item${open.count === 1 ? "" : "s"} still need a decision`, "Car documents → Review list."));
  const { data: files } = await createAdminClient().storage.from("docs-backups").list("", { limit: 5, sortBy: { column: "name", order: "desc" } });
  out.push(files?.length ? ok(A, "Daily saved copy", `the latest is ${files[0].name}`) : warn(A, "Daily saved copy", "no saved copy yet", "Apply migration 32; the scheduled run saves one a day."));
  return out;
}

/** Has anyone typed in the old Google Sheet since the move? (Read only.) */
async function oldSheetChanges(): Promise<Check[]> {
  const A = "Cut-over", id = process.env.DOCS_BIBLE_SHEET_ID?.trim();
  if (!id) return [info(A, "Old sheet", "not checked: DOCS_BIBLE_SHEET_ID is not set")];
  const tab = docsTab();
  const gid = (await listTabInfo(id)).find((t) => t.name.trim().toUpperCase() === tab.toUpperCase())?.gid;
  if (!gid) return [fail(A, "Old sheet", `the tab "${tab}" was not found`, "Check DOCS_BIBLE_DOCS_TAB.")];
  const rows = await csvOf(id, `export?format=csv&gid=${encodeURIComponent(gid)}`);
  const db = createAdminClient() as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data } = await db.from("docs_units").select("plate_no, source_row, raw").eq("source", "import").not("source_row", "is", null).limit(5000);
  const moved: MovedRow[] = (data ?? []).map((u: { plate_no: string; source_row: number; raw: Record<string, string> | null }) => ({ plate: u.plate_no, sourceRow: u.source_row, raw: u.raw ?? {} }));
  const r = sheetChangesSinceMove(rows, moved, (v) => normalizePlate(v));
  const out: Check[] = [];
  out.push(r.changed.length === 0 ? ok(A, "Old sheet unchanged", `${r.checkedRows} moved rows still say what they said at the move`) : warn(A, "Old sheet was changed after the move", `${r.changed.length} cell${r.changed.length === 1 ? "" : "s"} on ${r.carsChanged} car${r.carsChanged === 1 ? "" : "s"}; for example ${r.changed.slice(0, 3).map((c) => `${c.plate} ${c.column}: "${c.was}" became "${c.now}"`).join("; ")}`, "These changes are not in the app. Copy them into the app, then check again."));
  out.push(r.newPlates.length === 0 ? ok(A, "No new rows in the old sheet", "every plate in the sheet was moved") : warn(A, "Rows added to the old sheet after the move", `${r.newPlates.length}: ${r.newPlates.slice(0, 8).join(", ")}`, "Add these cars in the app (Add a car)."));
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
    Promise.resolve(settings()), safe("Database", "Database", database), safe("Car status sheet", "Car status sheet", inventorySheet),
    safe("Docs Bible (database)", "Docs Bible", docsBibleDatabase), safe("Cut-over", "Old sheet", oldSheetChanges), safe("Drive folders", "Drive", drive),
  ]);
  return parts.flat();
}
