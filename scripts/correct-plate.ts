// Corrects a mistyped plate everywhere the app keeps it: the Docs Bible row, the car's folder link, its photos and what the bot read, the approval and
// details, transmittals, bot jobs and review items. The plate is the key of all of them, so this moves them together; nothing is deleted except the
// old folder-link row once everything points to the new plate. It does NOT rename the folder in Google Drive: do that yourself right after
// (the new name must end with the plate in brackets), before pressing "Refresh from Drive".
//   npx jiti scripts/correct-plate.ts --from ADZ9807 --to DDZ9807            shows what would move (changes nothing)
//   npx jiti scripts/correct-plate.ts --from ADZ9807 --to DDZ9807 --apply    does it
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const arg = (n: string) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : undefined; };
const key = (v: string | undefined) => (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const from = key(arg("--from")), to = key(arg("--to")), apply = process.argv.includes("--apply");
if (!from || !to || from === to || to.length < 5) { console.error("Usage: --from OLDPLATE --to NEWPLATE [--apply]"); process.exit(2); }
const env: Record<string, string | undefined> = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// tables that keep the plate, as plate_no (their own key, or just a column)
const CHILDREN = ["folder_files", "unit_workflow", "transmittals", "grokbot_jobs", "docs_review_items", "unit_sheet_sync", "deal_units", "car_repairs", "or_renewals", "car_price_history", "car_sync_items"];

async function count(table: string, plate: string): Promise<number | null> {
  const { count: n, error } = await db.from(table).select("*", { count: "exact", head: true }).eq("plate_no", plate);
  return error ? null : n ?? 0; // null: the table does not exist (yet)
}

async function main() {
  console.log(`Plate ${from} -> ${to}. ${apply ? "APPLYING" : "Dry run, nothing is changed."}\n`);
  for (const t of ["docs_units", "unit_folders", ...CHILDREN]) {
    const a = await count(t, from), b = await count(t, to);
    if (a === null) continue;
    console.log(`  ${t.padEnd(18)} with ${from}: ${a}${b ? `   with ${to}: ${b}  <-- already used!` : ""}`);
  }
  if (!(await count("docs_units", from))) throw new Error(`${from} is not in the Docs Bible.`);
  for (const t of ["docs_units", "unit_folders", ...CHILDREN]) if (((await count(t, to)) ?? 0) > 0) throw new Error(`${to} is already used in ${t}. Nothing was changed.`);
  const { data: folder } = await db.from("unit_folders").select("*").eq("plate_no", from).maybeSingle();
  console.log(`\nDrive folder now: ${folder ? `"${folder.folder_name}" (${folder.location})` : "none linked"}`);
  if (!apply) { console.log("\nNothing was changed. Add --apply to do it."); return; }

  const display = to.replace(/^([A-Z]+)(\d+)$/, "$1 $2").replace(/ /g, "");
  const moved: string[] = [];
  const undo = async () => {
    await db.from("docs_units").update({ plate_no: from, plate_display: from }).eq("plate_no", to);
    if (folder) { const back = await db.from("unit_folders").select("plate_no").eq("plate_no", from).maybeSingle(); if (!back.data) await db.from("unit_folders").insert({ ...folder, folder_id: null, folder_name: null, folder_url: null, match_status: "none", candidates: [] }); }
    for (const t of moved.reverse()) await db.from(t).update({ plate_no: from }).eq("plate_no", to);
    if (folder) { await db.from("unit_folders").delete().eq("plate_no", to); await db.from("unit_folders").update({ folder_id: folder.folder_id, folder_name: folder.folder_name, folder_url: folder.folder_url, match_status: folder.match_status, candidates: folder.candidates }).eq("plate_no", from); }
  };
  try {
    if (folder) {
      // the folder id is unique, so the new row first waits without it; it takes the folder over when the old row is gone
      const { error } = await db.from("unit_folders").insert({ ...folder, plate_no: to, plate_display: display, folder_id: null, folder_name: null, folder_url: null, match_status: "none", candidates: [] });
      if (error) throw new Error(`folder link: ${error.message}`);
    }
    for (const t of CHILDREN) {
      if ((await count(t, from)) === null) continue;
      const { error } = await db.from(t).update({ plate_no: to }).eq("plate_no", from);
      if (error) throw new Error(`${t}: ${error.message}`);
      moved.push(t);
    }
    const { error } = await db.from("docs_units").update({ plate_no: to, plate_display: display, last_change_source: "correction" }).eq("plate_no", from);
    if (error) throw new Error(`docs_units: ${error.message}`);
    if (folder) {
      const gone = await db.from("unit_folders").delete().eq("plate_no", from);
      if (gone.error) throw new Error(`old folder link: ${gone.error.message}`);
      const { error: e2 } = await db.from("unit_folders").update({ folder_id: folder.folder_id, folder_name: folder.folder_name, folder_url: folder.folder_url, match_status: folder.match_status, candidates: folder.candidates }).eq("plate_no", to);
      if (e2) throw new Error(`folder link: ${e2.message}`);
    }
  } catch (e) { await undo(); throw new Error(`${e instanceof Error ? e.message : e}. Everything was put back.`); }
  console.log(`\nDone. ${from} is now ${to} everywhere in the app.${folder ? `\nNow rename the folder in Google Drive to end with (${display}), for example: "${String(folder.folder_name).replace(new RegExp(from, "gi"), display)}". Do it before pressing Refresh from Drive.` : ""}`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
