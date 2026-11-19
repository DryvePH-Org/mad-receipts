// Brings the repairs the owner tested in the copy of the MAD PRICE LIST into the app's database (migration 42): the REPAIRS REPORT tab and the
// INVENTORY 2026 REPAIR STATUS column. The 14 older rows are already in (matched by plate and problem, never doubled). A bot row is imported only
// when its car is in MAD (the test car TST 001 and plates MAD does not have are listed and left out). The car's status then follows its open jobs.
//   JITI_ALIAS='{"@/":"<project folder>/src/"}' npx jiti scripts/repairs-import.ts            dry run
//   JITI_ALIAS=... npx jiti scripts/repairs-import.ts --apply
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { dueDate, isOpen, stateAfterRepairs } from "../src/lib/repairs/model";
import { normalizePlate } from "../src/lib/rules/plate";

const apply = process.argv.includes("--apply");
const env: Record<string, string | undefined> = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
type Row = { row: number; ym: string | null; brand: string | null; plate: string | null; problem: string | null; happened: string | null; solution: string | null; supplier: string | null; company: string | null; est: string | null; status: string | null; key: string | null; approved_by: string | null };
const snap = JSON.parse(readFileSync("Docs/sheets-private/repairs.snapshot.json", "utf8")) as { repairs: Row[]; inventory_repair_status: { plate: string; repair_status: string }[] };
const norm = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function main() {
  const probe = await db.from("car_repairs").select("key", { head: true, count: "exact" });
  const ready = !probe.error;
  if (!ready) console.log("(migration 42 is not applied yet: showing what would happen)\n");
  const { data: units } = await db.from("docs_units").select("id, plate_no, stock_state, make, model_variant, year_model, arrival_date").is("archived_at", null).order("arrival_date", { ascending: false, nullsFirst: false }).limit(10000);
  const unitOf = new Map<string, NonNullable<typeof units>[number]>(); for (const u of units ?? []) if (!unitOf.has(u.plate_no as string)) unitOf.set(u.plate_no as string, u);
  const have = await db.from("car_repairs").select("plate_no, problem, key").limit(5000);
  const haveSet = new Set((have.data ?? []).map((r) => `${r.plate_no}|${norm(r.problem as string)}`)), haveKey = new Set((have.data ?? []).map((r) => r.key as string).filter(Boolean));
  const add: Record<string, unknown>[] = [], already: string[] = [], left: string[] = [];
  for (const r of snap.repairs) {
    const plate = normalizePlate(r.plate), car = unitOf.get(plate);
    if (haveSet.has(`${plate}|${norm(r.problem)}`) || (r.key && haveKey.has(r.key))) { already.push(plate); continue; }
    if (r.key && !car) { left.push(`${r.plate} (${r.problem})`); continue; }          // a bot row for a car MAD does not have: a test
    const rejected = /^REJECTED$/i.test(r.status ?? "");
    add.push({ plate_no: plate, unit_id: car?.id ?? null, ym: r.ym, brand: r.brand, vehicle: [car?.make, car?.model_variant].filter(Boolean).join(" ") || null, problem: r.problem, happened_on: dueDate(r.happened), happened_raw: dueDate(r.happened) ? null : r.happened,
      solution: r.solution, supplier: r.supplier, company: r.company, est_timeline: r.est, due_on: dueDate(r.est), status: (r.status ?? "").toUpperCase() || null, key: r.key, approved_by: r.approved_by,
      approval: rejected ? "rejected" : "approved", source: r.key ? "bot" : "import", sort_order: r.row, raw: r });
  }
  console.log(`Rows in the tab: ${snap.repairs.length} | already in the database: ${already.length} | to add: ${add.length} | left out (not a MAD car): ${left.length}`);
  for (const a of add) console.log(`  + ${a.plate_no} ${a.status} ${a.problem}`);
  for (const l of left) console.log(`  - ${l}`);
  console.log(`Repair status column: ${snap.inventory_repair_status.map((x) => `${x.plate} ${x.repair_status}`).join(", ")}`);
  if (!apply) { console.log("\nNothing was written. Add --apply after migration 42."); return; }
  if (!ready) throw new Error("Migration 42 is not applied yet.");
  if (add.length) { const { error } = await db.from("car_repairs").insert(add); if (error) throw new Error(error.message); }
  // the car's one status follows its open jobs (an Onhand car with an open job is For repair)
  const plates = new Set([...add.map((a) => a.plate_no as string), ...snap.inventory_repair_status.map((x) => normalizePlate(x.plate))]);
  for (const plate of plates) {
    const car = unitOf.get(plate); if (!car) continue;
    const jobs = (await db.from("car_repairs").select("status, approval").eq("plate_no", plate).eq("approval", "approved")).data ?? [];
    const next = stateAfterRepairs((car.stock_state as string | null) ?? null, jobs.filter((j) => isOpen({ status: j.status as string | null, approval: "approved" })).length);
    if (next) { await db.from("docs_units").update({ stock_state: next, last_change_source: "repairs" }).eq("id", car.id as string); console.log(`  ${plate}: ${car.stock_state ?? "no state"} → ${next}`); }
  }
  console.log(`Done: ${add.length} repairs added.`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
