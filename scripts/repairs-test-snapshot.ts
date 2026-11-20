// Before a test of the repairs bot: remembers the car statuses and the repair jobs as they are now, so scripts/repairs-test-cleanup.ts can put everything back.
//   npx jiti scripts/repairs-test-snapshot.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env: Record<string, string | undefined> = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function main() {
  const units = (await db.from("docs_units").select("id, plate_no, stock_state, state_for, state_on").limit(10000)).data ?? [];
  const jobs = (await db.from("car_repairs").select("id, status, approval, solution, supplier, company, est_timeline, due_on").limit(10000)).data ?? [];
  writeFileSync("Docs/sheets-private/repairs-test.snapshot.json", JSON.stringify({ at: new Date().toISOString(), units, jobs }));
  console.log(`Remembered ${units.length} cars and ${jobs.length} repair jobs (${new Date().toISOString()}).`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
