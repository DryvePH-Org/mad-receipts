// Clears what the app learned from the TEST Drive folders, so the live Drive can be read from a clean start: the car folders and their
// files (and the scan results), the approvals and details, the transmittals, the handoff checks, and the scan jobs.
// It NEVER touches the Docs Bible register (docs_units and its history), the users, the receipts or Drive itself.
//   npx jiti scripts/reset-test-documents.ts            shows what would be deleted (changes nothing)
//   npx jiti scripts/reset-test-documents.ts --apply    deletes it
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const env: Record<string, string | undefined> = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// children first, so nothing is left pointing at a deleted row
const TABLES: { table: string; pk: string; note: string; filter?: (q: any) => any }[] = [ // eslint-disable-line @typescript-eslint/no-explicit-any
  { table: "folder_files", pk: "id", note: "photos of the cars and what the bot read from them" },
  { table: "unit_folders", pk: "plate_no", note: "the car folders found in Drive" },
  { table: "unit_workflow", pk: "plate_no", note: "approvals and handoff records" },
  { table: "unit_details", pk: "plate_no", note: "the About the car answers" },
  { table: "transmittals", pk: "plate_no", note: "transmittal receipts" },
  { table: "unit_sheet_sync", pk: "plate_no", note: "old sheet sync records" },
  { table: "grokbot_jobs", pk: "id", note: "scan jobs", filter: (q) => q.like("action", "docs_%") },
  { table: "docs_handoff_events", pk: "id", note: "handoff steps made in the app while testing", filter: (q) => q.eq("source", "app") },
];

async function main() {
  console.log(apply ? "DELETING:" : "Dry run (nothing is deleted). Would delete:");
  for (const t of TABLES) {
    const base = db.from(t.table).select("*", { count: "exact", head: true });
    const { count, error } = await (t.filter ? t.filter(base) : base);
    if (error) { console.log(`  ${t.table}: ${error.message}`); continue; }
    console.log(`  ${String(count ?? 0).padStart(5)}  ${t.table}  (${t.note})`);
    if (apply && (count ?? 0) > 0) {
      const del = db.from(t.table).delete();
      const r = await (t.filter ? t.filter(del) : del.not(t.pk, "is", null));
      if (r.error) { console.error(`STOPPED at ${t.table}: ${r.error.message}`); process.exit(1); }
    }
  }
  const { count: units } = await db.from("docs_units").select("id", { count: "exact", head: true });
  console.log(`The Docs Bible register is untouched (${units} rows). ${apply ? "Done." : "Run again with --apply to delete."}`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
