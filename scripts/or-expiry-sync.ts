// Brings every OR expiry date together: the Docs Bible's own (the text column `renewal`), the price list's OR EXP, the FOR RENEWAL tab and the older
// REMARKS register. A blank Docs Bible date is filled when every sheet that has one agrees; any different date becomes a row of the Price list
// check (never swapped in silently). Needs the snapshot (scripts/pricelist-snapshot.py) and, to write, migration 37.
//   JITI_ALIAS='{"@/":"<project folder>/src/"}' npx jiti scripts/or-expiry-sync.ts            dry run: shows what it would do
//   JITI_ALIAS=... npx jiti scripts/or-expiry-sync.ts --apply
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseSheetDate } from "../src/lib/cars/model";
import { compareOrDates, type OrFinding, type OrSource } from "../src/lib/docsbible/or-expiry";
import { plateKeyOf, type SnapshotRow } from "../src/lib/pricelist/import";

const apply = process.argv.includes("--apply");
const env: Record<string, string | undefined> = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const snap = JSON.parse(readFileSync("Docs/sheets-private/pricelist.snapshot.json", "utf8")) as { taken: string; inventory: SnapshotRow[]; renewals: SnapshotRow[]; remarks_tab: SnapshotRow[] };

const dateOf = (v: unknown) => { const s = String(v ?? "").trim(); return s ? parseSheetDate(s) : null; };

async function main() {
  console.log(`OR expiry from the snapshot of ${snap.taken}. ${apply ? "WRITING" : "Dry run, nothing is written."}\n`);
  const { data: units } = await db.from("docs_units_current").select("id, plate_no, renewal").limit(5000);
  const unit = new Map((units ?? []).map((u) => [u.plate_no as string, u]));
  const sheets: [string, SnapshotRow[], string, string, "live" | "older"][] = [["the price list", snap.inventory, "PLATE NUMBER", "OR EXP", "live"], ["the renewal list", snap.renewals, "PLATE NUMBER", "OR EXP", "older"], ["the REMARKS register", snap.remarks_tab, "PLATE NO./INVENTORY", "OR EXPIRATION", "older"]];
  const sources = new Map<string, OrSource[]>(); const odd: string[] = [];
  for (const [name, rows, plateCol, dateCol, kind] of sheets) for (const r of rows) {
    const plate = plateKeyOf(r[plateCol]); if (!plate) continue;
    const date = dateOf(r[dateCol]);
    if (!date && r[dateCol]) odd.push(`${plate} (${name}): "${r[dateCol]}"`);
    sources.set(plate, [...(sources.get(plate) ?? []), { name, date, kind }]);
  }
  const findings: OrFinding[] = []; let same = 0, noDocsCar = 0;
  for (const [plate, srcs] of sources) {
    const u = unit.get(plate);
    if (!u) { noDocsCar++; continue; }
    const docsDate = dateOf(u.renewal);
    const f = compareOrDates(plate, docsDate, srcs);
    if (!f.length && srcs.some((s) => s.date)) same++;
    findings.push(...f);
  }
  const fills = findings.filter((f) => f.kind === "fill"), others = findings.filter((f) => f.kind !== "fill");
  const docsWithDate = (units ?? []).filter((u) => dateOf(u.renewal)).length, docsText = (units ?? []).filter((u) => u.renewal && !dateOf(u.renewal)).length;
  console.log(`Docs Bible: ${units?.length} cars, ${docsWithDate} with a clear OR date, ${docsText} with text that is not a clear date (kept as typed).`);
  console.log(`Cars with a date in a sheet: ${sources.size} | all agree with the Docs Bible: ${same} | not in the Docs Bible: ${noDocsCar}`);
  console.log(`To fill (Docs Bible blank, sheets agree): ${fills.length} | for the Price list check: ${others.length} (${others.filter((o) => o.kind === "differs").length} differ, ${others.filter((o) => o.kind === "disagree").length} sheets disagree)`);
  if (odd.length) console.log(`Sheet cells that are not a date (left as typed): ${odd.join("; ")}`);
  for (const f of others.slice(0, 20)) console.log(`  [${f.kind}] ${f.plate} ${f.message}`);
  if (!apply) { console.log("\nNothing was written. Add --apply after migration 37."); return; }

  const probe = await db.from("docs_units").select("or_expiry").limit(1);
  if (probe.error) throw new Error(`Migration 37 is not applied yet (${probe.error.message}).`);
  for (const f of fills) { const { error } = await db.from("docs_units").update({ renewal: f.value, last_change_source: "pricelist" }).eq("id", unit.get(f.plate)!.id as string); if (error) console.log(`  ${f.plate}: not filled: ${error.message}`); }
  const { data: past } = await db.from("car_sync_items").select("plate_no, list_value, docs_value").eq("status", "settled").eq("field", "or_expiry");
  const settled = new Set((past ?? []).map((p) => `${p.plate_no}|${p.list_value ?? ""}|${p.docs_value ?? ""}`));
  await db.from("car_sync_items").delete().eq("status", "open").eq("field", "or_expiry");
  const rows = others.filter((o) => !settled.has(`${o.plate}|${o.value ?? ""}|${o.docsValue ?? ""}`)).map((o) => ({ plate_no: o.plate, field: "or_expiry", list_value: o.value, docs_value: o.docsValue, message: o.message, unit_id: unit.get(o.plate)?.id ?? null }));
  if (rows.length) { const { error } = await db.from("car_sync_items").insert(rows); if (error) throw new Error(`price list check: ${error.message}`); }
  console.log(`\nDone: ${fills.length} dates filled, ${rows.length} items on the price list check.`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
