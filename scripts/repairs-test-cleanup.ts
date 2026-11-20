// After a test of the repairs bot: puts the data back as scripts/repairs-test-snapshot.ts remembered it. Dry run by default.
// Removes the repair jobs made since (with their history), restores any job that was changed, restores any car status that moved, and clears the bot's drafts,
// waiting states and counters (only safe while nobody is really using the bot yet). Telegram messages already sent in the group stay there.
//   npx jiti scripts/repairs-test-cleanup.ts            shows what would be put back
//   npx jiti scripts/repairs-test-cleanup.ts --apply
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const env: Record<string, string | undefined> = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
type Unit = { id: string; plate_no: string; stock_state: string | null; state_for: string | null; state_on: string | null };
type Job = { id: string; status: string | null; approval: string; solution: string | null; supplier: string | null; company: string | null; est_timeline: string | null; due_on: string | null };
const snap = JSON.parse(readFileSync("Docs/sheets-private/repairs-test.snapshot.json", "utf8")) as { at: string; units: Unit[]; jobs: Job[] };

async function main() {
  console.log(`${apply ? "PUTTING BACK" : "Dry run:"} the data as it was at ${snap.at}\n`);
  const nowJobs = ((await db.from("car_repairs").select("id, plate_no, problem, status, approval, solution, supplier, company, est_timeline, due_on").limit(10000)).data ?? []) as (Job & { plate_no: string; problem: string | null })[];
  const had = new Map(snap.jobs.map((j) => [j.id, j]));
  const added = nowJobs.filter((j) => !had.has(j.id));
  const changed = nowJobs.filter((j) => { const o = had.get(j.id); return o && JSON.stringify([o.status, o.approval, o.solution, o.supplier, o.company, o.est_timeline, o.due_on]) !== JSON.stringify([j.status, j.approval, j.solution, j.supplier, j.company, j.est_timeline, j.due_on]); });
  const gone = snap.jobs.filter((j) => !nowJobs.some((n) => n.id === j.id));
  console.log(`Jobs made since: ${added.length}${added.length ? ` (${added.map((j) => `${j.plate_no} "${j.problem}"`).join("; ")})` : ""}`);
  console.log(`Jobs changed since: ${changed.length}${changed.length ? ` (${changed.map((j) => `${j.plate_no} "${j.problem}": ${had.get(j.id)!.status} → ${j.status}`).join("; ")})` : ""}`);
  console.log(`Jobs missing now: ${gone.length}${gone.length ? " (these cannot be restored by this script: stop and tell the developer)" : ""}`);
  const nowUnits = ((await db.from("docs_units").select("id, plate_no, stock_state, state_for, state_on").limit(10000)).data ?? []) as Unit[];
  const was = new Map(snap.units.map((u) => [u.id, u]));
  const moved = nowUnits.filter((u) => { const o = was.get(u.id); return o && (o.stock_state !== u.stock_state || o.state_for !== u.state_for || o.state_on !== u.state_on); });
  console.log(`Car statuses changed since: ${moved.length}${moved.length ? ` (${moved.map((u) => `${u.plate_no}: ${was.get(u.id)!.stock_state} → ${u.stock_state}`).join("; ")})` : ""}`);
  for (const t of ["repair_bot_drafts", "repair_bot_awaiting", "repair_bot_usage"]) console.log(`${t}: ${(await db.from(t).select("*", { head: true, count: "exact" })).count ?? 0} rows to clear`);
  if (!apply) { console.log("\nNothing was changed. Add --apply."); return; }
  if (gone.length) throw new Error("Some jobs are missing: nothing was changed.");
  if (added.length) await db.from("car_repairs").delete().in("id", added.map((j) => j.id));
  for (const j of changed) { const o = had.get(j.id)!; await db.from("car_repairs").update({ status: o.status, approval: o.approval, solution: o.solution, supplier: o.supplier, company: o.company, est_timeline: o.est_timeline, due_on: o.due_on }).eq("id", j.id); }
  for (const u of moved) { const o = was.get(u.id)!; await db.from("docs_units").update({ stock_state: o.stock_state, state_for: o.state_for, state_on: o.state_on, last_change_source: "repairs-test" }).eq("id", u.id); }
  await db.from("repair_bot_drafts").delete().neq("id", "");
  await db.from("repair_bot_awaiting").delete().neq("kind", "");
  await db.from("repair_bot_usage").delete().neq("kind", "");
  await db.from("repair_bot_kv").delete().like("key", "mute:%");
  console.log("\nDone: put back. Check Car status and Repairs once.");
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
