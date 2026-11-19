// Gives every car its ONE status (stock_state on the car record) from what the two old places said: the price list's status note and repair state,
// and the Docs Bible's STATUS and VEHICLE STATUS. A car on the price list takes the price list's Reserved / Sold / For repair / Sell as is (typed daily);
// otherwise the Docs Bible's columns; otherwise Onhand. A disagreement that matters becomes a row of the Data check. The old two columns are then
// written from the state by the database. Only cars with no state yet are touched, unless --force. Needs migration 39.
//   JITI_ALIAS='{"@/":"<project folder>/src/"}' npx jiti scripts/status-sync.ts [--apply] [--force]
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { deriveState } from "../src/lib/cars/state";

const apply = process.argv.includes("--apply"), force = process.argv.includes("--force");
const env: Record<string, string | undefined> = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);

async function main() {
  console.log(`One status per car. ${apply ? "WRITING" : "Dry run, nothing is written."}${force ? " (--force: cars that already have a state are re-derived)" : ""}\\n`.replace("\\n", "\n"));
  const probe = await db.from("docs_units").select("stock_state").limit(1);
  const ready = !probe.error;
  if (!ready) console.log("(migration 39 is not applied yet: showing what would happen)\n");
  const { data: units } = await db.from("docs_units_current").select("id, plate_no, sale_status, vehicle_status" + (ready ? ", stock_state" : "")).limit(5000);
  const { data: stock } = await db.from("car_stock").select("unit_id, plate_no, remarks, repair_status, in_stock").eq("in_stock", true).limit(5000);
  const stockOf = new Map((stock ?? []).map((s) => [s.unit_id as string, s]));
  const rows = (units ?? []) as unknown as { id: string; plate_no: string; sale_status: string | null; vehicle_status: string | null; stock_state?: string | null }[];
  const tally = new Map<string, number>(); const conflicts: { plate: string; unit: string; list: string; docs: string; message: string }[] = [];
  const plan: { id: string; plate: string; state: string; who: string | null; on: string | null; note: string | null; stockUnit: string | null }[] = [];
  for (const u of rows) {
    if (!force && u.stock_state) continue;
    const s = stockOf.get(u.id);
    const d = deriveState({ inStock: !!s, remarks: (s?.remarks as string | null) ?? null, repair: (s?.repair_status as string | null) ?? null, sale: u.sale_status, vehicle: u.vehicle_status, today });
    tally.set(d.state, (tally.get(d.state) ?? 0) + 1);
    plan.push({ id: u.id, plate: u.plate_no, state: d.state, who: d.who, on: d.on, note: d.note || null, stockUnit: s ? u.id : null });
    if (d.conflict) conflicts.push({ plate: u.plate_no, unit: u.id, list: String(s?.remarks ?? "(no note)"), docs: `${u.sale_status ?? "-"} / ${u.vehicle_status ?? "-"}`, message: d.conflict });
  }
  console.log(`Cars to give a state: ${plan.length}`);
  console.log(`  ${[...tally].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ")}`);
  console.log(`Disagreements for the Data check: ${conflicts.length}`);
  for (const c of conflicts.slice(0, 20)) console.log(`  ${c.plate}: ${c.message}`);
  if (!apply) { console.log("\nNothing was written. Add --apply after migration 39."); return; }
  if (!ready) throw new Error("Migration 39 is not applied yet.");

  let done = 0;
  for (const p of plan) {
    const reservedOrSold = p.state === "Reserved" || p.state === "Sold";
    const { error } = await db.from("docs_units").update({ stock_state: p.state, state_for: reservedOrSold ? p.who : null, state_on: reservedOrSold ? p.on : null, last_change_source: "status" }).eq("id", p.id);
    if (error) { console.log(`  ${p.plate}: ${error.message}`); continue; }
    // the stock row keeps only the note (its status part and repair state now live in the state; the original stays in the saved original row)
    if (p.stockUnit) await db.from("car_stock").update({ remarks: p.note, repair_status: null }).eq("unit_id", p.stockUnit);
    done++;
  }
  // the old "two statuses disagree" items of the move are moot now
  const settled = await db.from("docs_review_items").update({ status: "resolved", decision: "One status now: the car has a single state" }).eq("kind", "status_disagree").eq("status", "open").select("id");
  await db.from("car_sync_items").delete().eq("status", "open").eq("field", "status");
  if (conflicts.length) { const { error } = await db.from("car_sync_items").insert(conflicts.map((c) => ({ plate_no: c.plate, field: "status", list_value: c.list, docs_value: c.docs, message: c.message, unit_id: c.unit }))); if (error) throw new Error(`data check: ${error.message}`); }
  console.log(`\nDone: ${done} cars have a state, ${settled.data?.length ?? 0} old "status differs" items closed, ${conflicts.length} on the Data check.`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
