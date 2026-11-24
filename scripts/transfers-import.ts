// Brings the ORCR WITH MAD tab in as transfer records, each linked to its car by plate (migration 41). The tab stays as it is in the old workbook.
// A car that is not in the car record yet is kept by its plate and linked automatically when it is added. Re-running replaces only the imported rows
// that nobody has edited since (the rows the staff changed or added are never touched).
//   python3 (one time, see the snapshot step in Docs/archive/one-database-plan.md) → Docs/sheets-private/orcr-with-mad.snapshot.json
//   JITI_ALIAS='{"@/":"<project folder>/src/"}' npx jiti scripts/transfers-import.ts            dry run
//   JITI_ALIAS=... npx jiti scripts/transfers-import.ts --apply
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fullYear } from "../src/lib/inventory/year";
import { normalizePlate } from "../src/lib/rules/plate";

const apply = process.argv.includes("--apply");
const env: Record<string, string | undefined> = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
type Row = Record<string, string | number | null>;
const snap = JSON.parse(readFileSync("Docs/sheets-private/orcr-with-mad.snapshot.json", "utf8")) as Row[];
const t = (v: string | number | null | undefined) => (v === null || v === undefined ? null : String(v).replace(/\s+/g, " ").trim() || null);
const up = (v: string | number | null | undefined) => t(v)?.toUpperCase() ?? null;

async function main() {
  const { data: units } = await db.from("docs_units").select("id, plate_no, arrival_date").is("archived_at", null).order("arrival_date", { ascending: false, nullsFirst: false }).limit(10000);
  const unitOf = new Map<string, string>(); for (const u of units ?? []) if (!unitOf.has(u.plate_no as string)) unitOf.set(u.plate_no as string, u.id as string);
  const rows = snap.map((r) => {
    const plate = normalizePlate(String(r.plate));
    const unit = unitOf.get(plate) ?? null;
    const car = [t(r.ym) ? fullYear(t(r.ym)!) : null, t(r.make), t(r.model)].filter(Boolean).join(" ") || null;
    return { unit_id: unit, plate_no: plate, car_text: car, particular: up(r.particular), financing: up(r.financing), buyer: up(r.buyer), address: up(r.address), contact: t(r.contact),
      cr_date: t(r.cr_date), transaction_date: t(r.transaction_date), liaison: up(r.liaison), sales: up(r.sales), balance: t(r.balance), source: "import", sheet_row: r.row as number, raw: r };
  });
  const linked = rows.filter((r) => r.unit_id), waiting = rows.filter((r) => !r.unit_id);
  const noBuyer = rows.filter((r) => !r.buyer).map((r) => r.plate_no);
  console.log(`Transfers in the tab: ${rows.length} | linked to a car of the record: ${linked.length} | waiting for their car (kept by plate): ${waiting.length}`);
  console.log(`Without a buyer name: ${noBuyer.length ? noBuyer.join(", ") : "none"} | without a CR date: ${rows.filter((r) => !r.cr_date).length}`);
  console.log(`Waiting plates: ${waiting.map((w) => w.plate_no).join(", ")}`);
  if (!apply) { console.log("\nNothing was written. Add --apply after migration 41."); return; }
  const probe = await db.from("car_sales").select("id", { head: true, count: "exact" });
  if (probe.error) throw new Error(`Migration 41 is not applied yet (${probe.error.message}).`);
  // replace only imported rows nobody edited (updated_by is set by every edit in the app)
  const del = await db.from("car_sales").delete().eq("source", "import").is("updated_by", null).select("id");
  console.log(`Earlier imported rows replaced: ${del.data?.length ?? 0}`);
  const edited = new Set(((await db.from("car_sales").select("sheet_row").eq("source", "import")).data ?? []).map((x) => x.sheet_row as number));
  const todo = rows.filter((r) => !edited.has(r.sheet_row));
  for (let i = 0; i < todo.length; i += 100) { const { error } = await db.from("car_sales").insert(todo.slice(i, i + 100)); if (error) throw new Error(error.message); }
  console.log(`Done: ${todo.length} transfers saved (${todo.filter((r) => r.unit_id).length} linked to a car).`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
