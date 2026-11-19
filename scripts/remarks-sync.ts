// The old REMARKS register held two facts nothing else had: where the original papers are (its DOCUMENTS column) and the registry of deeds.
// They become fields of the car record. A blank field is filled; a different code in the record is never replaced: it goes to the Data check.
//   JITI_ALIAS='{"@/":"<project folder>/src/"}' npx jiti scripts/remarks-sync.ts            dry run
//   JITI_ALIAS=... npx jiti scripts/remarks-sync.ts --apply                                 (needs migration 38)
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { plateKeyOf, type SnapshotRow } from "../src/lib/pricelist/import";

const apply = process.argv.includes("--apply");
const env: Record<string, string | undefined> = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const snap = JSON.parse(readFileSync("Docs/sheets-private/pricelist.snapshot.json", "utf8")) as { taken: string; remarks_tab: SnapshotRow[] };
const norm = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const clean = (v: unknown) => { const t = String(v ?? "").replace(/\s+/g, " ").trim(); return t || null; };

async function main() {
  console.log(`REMARKS register of ${snap.taken} (${snap.remarks_tab.length} rows). ${apply ? "WRITING" : "Dry run, nothing is written."}\n`);
  const probe = await db.from("docs_units").select("papers_with, registry_of_deeds").limit(1);
  const ready = !probe.error;
  if (!ready) console.log(`(migration 38 is not applied yet: showing what would happen from the register alone)\n`);
  const { data: units } = await db.from("docs_units_current").select("id, plate_no" + (ready ? ", papers_with, registry_of_deeds" : "")).limit(5000);
  const unit = new Map(((units ?? []) as unknown as { id: string; plate_no: string; papers_with?: string | null; registry_of_deeds?: string | null }[]).map((u) => [u.plate_no, u]));
  const fills: { id: string; plate: string; patch: Record<string, string> }[] = []; const items: { plate: string; list: string; docs: string; unit: string; message: string }[] = [];
  let notInMad = 0, same = 0;
  for (const r of snap.remarks_tab) {
    const plate = plateKeyOf(r["PLATE NO./INVENTORY"]); if (!plate) continue;
    const u = unit.get(plate); if (!u) { notInMad++; continue; }
    const patch: Record<string, string> = {};
    const code = clean(r["DOCUMENTS"]), reg = clean(r["REGISTRY OF DEEDS"]);
    if (reg) { if (!clean(u.registry_of_deeds)) patch.registry_of_deeds = reg; else if (norm(reg) === norm(u.registry_of_deeds)) same++; }
    if (code) {
      if (!clean(u.papers_with)) patch.papers_with = code;
      else if (norm(code) !== norm(u.papers_with)) items.push({ plate, list: code, docs: String(u.papers_with), unit: u.id, message: `Papers with: the REMARKS register says "${code}", the car record says "${u.papers_with}".` });
      else same++;
    }
    if (Object.keys(patch).length) fills.push({ id: u.id, plate, patch });
  }
  const count = (k: string) => fills.filter((f) => k in f.patch).length;
  console.log(`Cars in the register that are in MAD: ${snap.remarks_tab.length - notInMad} (not in MAD: ${notInMad}) | already the same: ${same}`);
  console.log(`To fill: papers with ${count("papers_with")}, registry of deeds ${count("registry_of_deeds")} | different codes for the Data check: ${items.length}`);
  for (const i of items.slice(0, 12)) console.log(`  [papers with] ${i.plate}: ${i.message}`);
  if (!apply) { console.log("\nNothing was written. Add --apply after migration 38."); return; }
  if (!ready) throw new Error("Migration 38 is not applied yet.");
  for (const f of fills) { const { error } = await db.from("docs_units").update({ ...f.patch, last_change_source: "remarks" }).eq("id", f.id); if (error) console.log(`  ${f.plate}: not filled: ${error.message}`); }
  const { data: past } = await db.from("car_sync_items").select("plate_no, list_value, docs_value").eq("status", "settled").eq("field", "docs_code");
  const settled = new Set((past ?? []).map((p) => `${p.plate_no}|${p.list_value ?? ""}|${p.docs_value ?? ""}`));
  const fresh = items.filter((i) => !settled.has(`${i.plate}|${i.list}|${i.docs}`)).map((i) => ({ plate_no: i.plate, field: "docs_code", list_value: i.list, docs_value: i.docs, message: i.message, unit_id: i.unit }));
  if (fresh.length) { const { error } = await db.from("car_sync_items").insert(fresh); if (error) throw new Error(`data check: ${error.message}`); }
  console.log(`\nDone: ${fills.length} cars filled, ${fresh.length} items on the Data check.`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
