import "server-only";
import { parseCsv } from "@/lib/dashboard/parse";
import { docsBridge } from "@/lib/docs/bridge";
import { appsScriptConfigured } from "@/lib/google/apps-script";
import { grokbotMissing } from "@/lib/grokbot/client";
import { plateOfFolderName } from "@/lib/docs/bridge";
import { normalizePlate } from "@/lib/rules/plate";
import { createAdminClient } from "@/lib/supabase/admin";
import { sheetChangesSinceMove, type MovedRow } from "./cutover";

const docsTab = () => process.env.DOCS_BIBLE_DOCS_TAB?.trim() || "DOCS 2026";

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

function settings(): Check[] {
  const e = process.env, A = "Settings";
  const out: Check[] = [];
  out.push(/^https:\/\//.test(e.APP_BASE_URL ?? "") ? ok(A, "App address", e.APP_BASE_URL as string) : fail(A, "App address", e.APP_BASE_URL ? "It must start with https://" : "APP_BASE_URL is not set", "The bots send their answers to this address."));
  const missing = grokbotMissing();
  out.push(missing.length ? fail(A, "Scanner bot connection", `Missing: ${missing.join(", ")}`) : ok(A, "Scanner bot connection", "address, key, callback secret and app address are set"));
  out.push(e.CRON_SECRET ? ok(A, "Scheduled jobs key", "set") : fail(A, "Scheduled jobs key", "CRON_SECRET is not set"));
  out.push(e.DOCS_BIBLE_SHEET_ID ? info(A, "Old Docs Bible sheet (watched for changes)", `ends ${tail(e.DOCS_BIBLE_SHEET_ID)}`) : warn(A, "Old Docs Bible sheet", "DOCS_BIBLE_SHEET_ID is not set: the cut-over check cannot look for changes made in the old sheet", "Set it to the live sheet's id (shared \"Anyone with the link can view\")."));
  out.push(info(A, "Who reads the photos", (e.DOCS_READER ?? "").toLowerCase() === "grokbot" ? "the grokbot scanner" : "a picture API (Groq or Grok)"));
  out.push(info(A, "Receipt audit copies in Drive", "saved by the app when a receipt is saved (the Apps Script needs the RECEIPTS_FOLDER_ID property). Google Sheets are not written any more."));
  out.push(e.TELEGRAM_BOT_TOKEN && (e.TELEGRAM_DOCS_CHAT_ID || e.TELEGRAM_CHAT_ID) ? ok(A, "Telegram", e.TELEGRAM_DOCS_CHAT_ID ? "a separate chat for the documents team" : "the main chat") : warn(A, "Telegram", "not configured: no scan, approval or handoff messages will be sent"));
  return out;
}

async function database(): Promise<Check[]> {
  const admin = createAdminClient(), A = "Database";
  const probes: [string, string, string, string][] = [
    ["unit_workflow", "id", "24", "details, approval and handoff"], ["docs_units", "plate_no", "30", "the car records"], ["docs_review_items", "kind", "30 and 31", "the data check"],
    ["grokbot_jobs", "bot, priority, plate_no", "25 and 27", "the grokbot queue"], ["transmittals", "plate_no", "22", "transmittal receipts"],
  ];
  const out: Check[] = [];
  for (const [table, cols, mig, what] of probes) {
    const { error } = await admin.from(table as "unit_workflow").select(table === "unit_workflow" ? "plate_no" : cols).limit(1);
    out.push(error ? fail(A, `Table ${table}`, `missing or out of date (${what})`, `Apply migration ${mig}.`) : ok(A, `Table ${table}`, what));
  }
  return out;
}

/** Car Inventory reads the app's own stock list: the stock rows, their cars, and anything waiting for a decision on the data check. */
async function priceListDatabase(): Promise<Check[]> {
  const A = "Car Inventory (database)", db = createAdminClient() as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const stock = await db.from("docs_units").select("id", { count: "exact", head: true }).eq("in_stock", true);
  if (stock.error) return [fail(A, "Car Inventory columns", "not there yet", "Apply migrations 35 to 40.")];
  const out: Check[] = [stock.count ? ok(A, "Cars in Car Inventory", `${stock.count}`) : fail(A, "Cars in Car Inventory", "none: the stock list was not moved yet", "Apply migration 40.")];
  const open = await db.from("car_sync_items").select("id", { count: "exact", head: true }).eq("status", "open");
  out.push((open.count ?? 0) === 0 ? ok(A, "Data check", "Car Inventory and Car documents agree") : warn(A, "Data check", `${open.count} item${open.count === 1 ? "" : "s"} still to settle`, "Car Inventory → Data check."));
  const noPrice = await db.from("docs_units").select("id", { count: "exact", head: true }).eq("in_stock", true).is("list_price", null);
  if (noPrice.count) out.push(warn(A, "Cars without a price", `${noPrice.count}`, "Open the car in Car Inventory and type its price."));
  return out;
}

/** The repairs bot (Telegram): the settings it needs, the people it knows and where Telegram sends its messages now. Never shows a key. */
async function repairsBot(): Promise<Check[]> {
  const A = "Repairs bot", e = process.env, out: Check[] = [];
  out.push(e.REPAIRS_TELEGRAM_BOT_TOKEN ? ok(A, "Bot token", "set") : info(A, "Bot token", "not set: the bot is off and the old bot is undisturbed (add REPAIRS_TELEGRAM_BOT_TOKEN on the switch day)"));
  out.push(e.REPAIRS_TELEGRAM_CHAT_ID ? ok(A, "Group", `…${e.REPAIRS_TELEGRAM_CHAT_ID.slice(-4)}`) : info(A, "Group", "not set (REPAIRS_TELEGRAM_CHAT_ID: the group's number, negative)"));
  out.push(e.ELEVENLABS_API_KEY ? ok(A, "Voice (ElevenLabs)", "set") : warn(A, "Voice (ElevenLabs)", "not set: voice notes will be refused, typing still works", "Add ELEVENLABS_API_KEY."));
  out.push(e.ANTHROPIC_API_KEY || e.GROQ_API_KEY ? ok(A, "Reading the reports", e.ANTHROPIC_API_KEY ? "Claude" : "Groq") : fail(A, "Reading the reports", "no model key", "GROQ_API_KEY (or ANTHROPIC_API_KEY)."));
  const db = createAdminClient() as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const people = await db.from("repair_people").select("role").eq("active", true);
  if (people.error) return [...out, fail(A, "Tables", "not there yet", "Apply migrations 42 and 43.")];
  const rows = (people.data ?? []) as { role: string }[];
  out.push(rows.some((p) => p.role !== "repairman") && rows.some((p) => p.role === "repairman" || p.role === "admin") ? ok(A, "People", `${rows.length} (${rows.filter((p) => p.role !== "repairman").length} who can approve)`) : warn(A, "People", `${rows.length}: someone must report and someone must approve`, "Repairs page → Telegram bot: who may use it."));
  if (e.REPAIRS_TELEGRAM_BOT_TOKEN) {
    try {
      const { repairsWebhookInfo } = await import("@/lib/repairs/bot/telegram");
      const w = await repairsWebhookInfo(), mine = /\/api\/repairs\/telegram$/.test(w.url);
      out.push(mine ? ok(A, "Telegram sends its messages to", "this app") : warn(A, "Telegram sends its messages to", w.url ? "the old bot (still)" : "nowhere", "The switch has not been done yet."));
      if (w.last_error_message) out.push(warn(A, "Telegram's last delivery error", w.last_error_message.slice(0, 120)));
    } catch (err) { out.push(warn(A, "Telegram", err instanceof Error ? err.message.slice(0, 120) : "could not be asked")); }
  }
  return out;
}

/** The Docs Bible in the database: the cars, the data check, and today's saved copy. */
async function docsBibleDatabase(): Promise<Check[]> {
  const A = "Car documents (database)", db = createAdminClient() as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const cars = await db.from("docs_units_current").select("id", { count: "exact", head: true });
  const open = await db.from("docs_review_items").select("id", { count: "exact", head: true }).eq("status", "open");
  const out: Check[] = [cars.count ? ok(A, "Cars in MAD", `${cars.count}`) : fail(A, "Cars in MAD", "none: the data was not moved yet", "Run scripts/docs-bible-apply.ts.")];
  out.push((open.count ?? 0) === 0 ? ok(A, "Data check", "nothing is waiting for a decision") : warn(A, "Data check", `${open.count} item${open.count === 1 ? "" : "s"} still need a decision`, "Car documents → Data check."));
  const { data: files } = await createAdminClient().storage.from("docs-backups").list("", { limit: 5, sortBy: { column: "name", order: "desc" } });
  out.push(files?.length ? ok(A, "Daily saved copy", `the latest is ${files[0].name}`) : warn(A, "Daily saved copy", "no saved copy yet", "Apply migration 32; the scheduled run saves one a day."));
  return out;
}

/** Reads a Google page without any caching, and says plainly when Google asks for a sign-in (the sheet is no longer shared by link). */
async function plainGet(url: string): Promise<{ ok: true; text: string } | { ok: false; locked: boolean; why: string }> {
  const res = await fetch(url, { redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(25_000) }).catch(() => null);
  if (!res) return { ok: false, locked: false, why: "Google could not be reached." };
  if (res.status === 401 || res.status === 403 || res.status === 404) return { ok: false, locked: true, why: `Google answered ${res.status}.` };
  const text = await res.text();
  if (!res.ok) return { ok: false, locked: false, why: `Google answered ${res.status}.` };
  if (/^\s*<(!doctype|html)/i.test(text) && /accounts\.google\.com|ServiceLogin|Sign in/i.test(text.slice(0, 4000))) return { ok: false, locked: true, why: "Google asks for a sign-in." };
  return { ok: true, text };
}

/** Has anyone typed in the old Google Sheet since the move? (Read only.) */
async function oldSheetChanges(): Promise<Check[]> {
  const A = "Cut-over", id = process.env.DOCS_BIBLE_SHEET_ID?.trim();
  if (!id) return [info(A, "Old sheet", "not checked: DOCS_BIBLE_SHEET_ID is not set")];
  const base = `https://docs.google.com/spreadsheets/d/${id}`;
  let gid = process.env.DOCS_BIBLE_DOCS_GID?.trim();
  if (!gid) {
    const page = await plainGet(`${base}/htmlview`);
    if (!page.ok) return [page.locked ? info(A, "Old sheet is not readable by link any more", "It was locked (shared with named people only), so nobody can read it without signing in. That is what the cut-over wants. The last check before locking is the one that counts.") : warn(A, "Old sheet could not be read", page.why, "Try again in a minute.")];
    const tabName = docsTab().toUpperCase();
    gid = [...page.text.matchAll(/items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)"[^}]*?gid:\s*"(\d+)"/g)].map((m) => ({ name: m[1], gid: m[2] })).find((t) => t.name.trim().toUpperCase() === tabName)?.gid;
    if (!gid) return [warn(A, "Old sheet", `the tab "${docsTab()}" was not found in the sheet`, "Check DOCS_BIBLE_DOCS_TAB, or set DOCS_BIBLE_DOCS_GID (the tab's number in its address).")];
  }
  const csv = await plainGet(`${base}/export?format=csv&gid=${encodeURIComponent(gid)}`);
  if (!csv.ok) return [csv.locked ? info(A, "Old sheet is not readable by link any more", "It was locked, which is what the cut-over wants.") : warn(A, "Old sheet could not be read", csv.why, "Try again in a minute.")];
  const rows = parseCsv(csv.text);
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
    Promise.resolve(settings()), safe("Database", "Database", database), safe("Car Inventory (database)", "Car Inventory", priceListDatabase), safe("Repairs bot", "Repairs bot", repairsBot),
    safe("Car documents (database)", "Car documents", docsBibleDatabase), safe("Cut-over", "Old sheet", oldSheetChanges), safe("Drive folders", "Drive", drive),
  ]);
  return parts.flat();
}
