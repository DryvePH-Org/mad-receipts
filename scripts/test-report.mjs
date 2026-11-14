// A read-only report for testing the documents workflow on one or more cars: what the app knows (photos read, flags, approval, sheet status,
// the bots' jobs and how long they took) next to what the Docs Bible sheet shows for the same plate. It changes nothing anywhere.
//
// Usage:  node scripts/test-report.mjs DAU6444 DAR4015
// Needs .env.local (the app's database keys) and DOCS_BIBLE_SHEET_ID (the sheet must be readable by link, as the copy is).
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const plates = process.argv.slice(2).map((p) => p.toUpperCase().replace(/[^A-Z0-9]/g, "")).filter(Boolean);
if (!plates.length) { console.error("Usage: node scripts/test-report.mjs PLATE [PLATE...]"); process.exit(2); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const sheetId = env.DOCS_BIBLE_SHEET_ID || "1wxJhP3LHAFd2LsPUcJjs7wPxwPzgiBjLJA8iVRtJ-hs";

/** A small CSV reader (quotes, commas and line breaks inside cells). */
function csv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
async function tab(name) {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return csv(await res.text());
}
const norm = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const ago = (iso) => (iso ? new Date(iso).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", second: "2-digit" }) : "-");
const secs = (a, b) => (a && b ? `${Math.round((Date.parse(b) - Date.parse(a)) / 1000)}s` : "-");

let docs = null, changelog = null, sheetError = null;
try { docs = await tab("DOCS 2026"); changelog = await tab("CHANGELOG"); } catch (e) { sheetError = e.message; }

for (const plate of plates) {
  console.log(`\n==================== ${plate} ====================`);
  const [{ data: folder }, { data: files }, { data: wf }, { data: sync }, { data: jobs }] = await Promise.all([
    db.from("unit_folders").select("folder_name, location, case_type, case_source").eq("plate_no", plate).maybeSingle(),
    db.from("folder_files").select("filename, read_status, doc_types, flags, confidence, read_error").eq("plate_no", plate).order("filename"),
    db.from("unit_workflow").select("docs_approved_at, marketing_notified_at, scan_notified_at, handoff_at, handoff_returned_at").eq("plate_no", plate).maybeSingle(),
    db.from("unit_sheet_sync").select("kind, status, error, updated_at").eq("plate_no", plate),
    db.from("grokbot_jobs").select("action, bot, status, created_at, started_at, completed_at, error").eq("plate_no", plate).order("created_at", { ascending: false }).limit(8),
  ]);
  if (!folder) { console.log("The app has no folder for this plate."); continue; }
  console.log(`APP  ${folder.folder_name}  [${folder.location}]  case: ${folder.case_type ?? "?"} (${folder.case_source})`);
  const by = {}; for (const f of files ?? []) by[f.read_status] = (by[f.read_status] ?? 0) + 1;
  console.log(`     photos: ${files?.length ?? 0}  ${JSON.stringify(by)}`);
  for (const f of files ?? []) console.log(`       ${f.filename.padEnd(22)} ${f.read_status.padEnd(10)} ${(f.doc_types ?? []).join(", ") || "-"}${f.flags?.length ? `  | ${f.flags.length} flag(s): ${f.flags[0].slice(0, 70)}` : ""}${f.read_error ? `  | ${f.read_error.slice(0, 60)}` : ""}`);
  console.log(`     approved: ${wf?.docs_approved_at ? ago(wf.docs_approved_at) : "no"}   marketing told: ${wf?.marketing_notified_at ? "yes" : "no"}   scan notice: ${wf?.scan_notified_at ? "yes" : "no"}`);
  for (const s of sync ?? []) console.log(`     sheet sync [${s.kind}]: ${s.status} at ${ago(s.updated_at)}${s.error ? `  ! ${s.error.slice(0, 90)}` : ""}`);
  console.log("     bot jobs (newest first): action, bot, status, waited, ran");
  for (const j of jobs ?? []) console.log(`       ${j.action.padEnd(13)} ${j.bot.padEnd(6)} ${j.status.padEnd(7)} waited ${secs(j.created_at, j.started_at ?? j.completed_at)}  ran ${secs(j.started_at, j.completed_at)}${j.error ? `  ! ${j.error.slice(0, 60)}` : ""}`);

  if (sheetError) { console.log(`SHEET could not be read: ${sheetError}`); continue; }
  const header = docs[0]; const col = (name) => header.findIndex((h) => h.replace(/\s+/g, " ").trim().toUpperCase() === name.toUpperCase());
  const iPlate = col("PLATE NO."), iArr = col("DATE ARRIVAL");
  const rowsFor = docs.slice(1).map((r, i) => ({ r, n: i + 2 })).filter(({ r }) => norm(r[iPlate]) === plate);
  if (!rowsFor.length) { console.log("SHEET  this plate is not in DOCS 2026"); continue; }
  const cur = rowsFor.sort((a, b) => String(b.r[iArr]).localeCompare(String(a.r[iArr])))[0];
  console.log(`SHEET  DOCS 2026${rowsFor.length > 1 ? `  (${rowsFor.length} rows with this plate; the latest arrival is shown)` : ""}`); // the export hides hidden rows, so its row numbers are not the sheet's: open the sheet and search the plate
  for (const h of ["CLASSIFICATION", "CR", "OR", "DEED OF SALE", "SELLER'S ID", "SEC CERT", "SEC ID'S", "BOARDS RESO", "Encumbered", "CHATTEL", "PROMISSORY", "COMPLETE DOCS?"]) {
    const i = col(h); console.log(`       ${h.padEnd(16)} ${i < 0 ? "(column not found)" : cur.r[i] || "(blank)"}`);
  }
  const iRem = col("REMARKS I");
  const note = (cur.r[iRem] ?? "").split("\n").slice(0, 3).join(" / ");
  console.log(`       REMARKS I        ${note ? note.slice(0, 120) : "(blank)"}${(cur.r[iRem] ?? "").length > 120 ? " …" : ""}`);
  const lines = (changelog ?? []).slice(1).filter((r) => norm(r[1]) === plate);
  console.log(`       CHANGELOG rows for this plate: ${lines.length}${lines.length ? `; the last: ${lines.at(-1)[0]} | ${lines.at(-1)[3]} | ${lines.at(-1)[4]} | ${String(lines.at(-1)[6]).slice(0, 30)}` : ""}`);
}
console.log("\n(read only: nothing was changed)");
