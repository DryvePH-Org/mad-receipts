// Read only: has anybody typed in the OLD Docs Bible sheet since the data was moved to the database? The same check as Admin → Sync jobs →
// Go-live check ("Cut-over"). Reads the sheet as plain CSV (it must be shared "Anyone with the link can view") and the moved rows' saved cells.
//   npx jiti scripts/docs-bible-sheet-check.ts <sheet id> [tab name]
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { sheetChangesSinceMove, type MovedRow } from "../src/lib/golive/cutover";

const [id, tab = "DOCS 2026"] = process.argv.slice(2);
if (!id) { console.error("Usage: npx jiti scripts/docs-bible-sheet-check.ts <sheet id> [tab name]"); process.exit(2); }
const env: Record<string, string | undefined> = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }

function csv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cell); cell = ""; } else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const get = async (url: string) => { const r = await fetch(url, { redirect: "follow" }); if (!r.ok) throw new Error(`Google answered ${r.status}`); return r.text(); };

async function main() {
  const html = await get(`https://docs.google.com/spreadsheets/d/${id}/htmlview`);
  const tabs = [...html.matchAll(/items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)"[^}]*?gid:\s*"(\d+)"/g)].map((m) => ({ name: JSON.parse(`"${m[1]}"`) as string, gid: m[2] }));
  const gid = tabs.find((t) => t.name.trim().toUpperCase() === tab.toUpperCase())?.gid;
  if (!gid) throw new Error(`The tab "${tab}" was not found (tabs: ${tabs.map((t) => t.name).join(", ") || "none"}). Is the sheet shared by link?`);
  const text = await get(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`);
  if (/^\s*<(!doctype|html)/i.test(text)) throw new Error("The sheet could not be read: share it as 'Anyone with the link can view'.");
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data } = await db.from("docs_units").select("plate_no, source_row, raw").eq("source", "import").not("source_row", "is", null).limit(5000);
  const moved: MovedRow[] = (data ?? []).map((u) => ({ plate: u.plate_no as string, sourceRow: u.source_row as number, raw: (u.raw ?? {}) as Record<string, string> }));
  const r = sheetChangesSinceMove(csv(text), moved, (v) => v.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  console.log(`Checked ${r.checkedRows} moved rows against the sheet as it is now.`);
  console.log(r.changed.length ? `${r.changed.length} cells changed on ${r.carsChanged} cars since the move:` : "No typed cell has changed since the move.");
  for (const c of r.changed.slice(0, 40)) console.log(`  row ${c.row} ${c.plate}  ${c.column}: "${c.was}" -> "${c.now}"`);
  console.log(r.newPlates.length ? `${r.newPlates.length} plates were added to the sheet after the move: ${r.newPlates.slice(0, 20).join(", ")}` : "No row was added to the sheet after the move.");
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
