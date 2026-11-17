// Loads a frozen Docs Bible snapshot into the database and then checks the result against the snapshot.
// It reads the app's .env.local (service role key) and writes ONLY the docs_* tables; it never touches a Google Sheet.
//   npx jiti scripts/docs-bible-apply.ts <snapshot.json>             first load (stops if import rows already exist)
//   npx jiti scripts/docs-bible-apply.ts <snapshot.json> --replace   deletes the earlier import rows and loads again
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { colLetter, planImport, type Snapshot } from "../src/lib/docsbible/import";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const replace = args.includes("--replace");
if (!file) { console.error("Usage: npx jiti scripts/docs-bible-apply.ts <snapshot.json> [--replace]"); process.exit(2); }

const env: Record<string, string | undefined> = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const fail = (msg: string): never => { console.error("STOPPED:", msg); process.exit(1); };
const ok = <T>(r: { data: T; error: { message: string } | null }, what: string): T => { if (r.error) fail(`${what}: ${r.error.message}`); return r.data; };
const chunks = <T>(list: T[], n: number): T[][] => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, (i + 1) * n));

async function main() {
  const snap = JSON.parse(readFileSync(file!, "utf8")) as Snapshot;
  const plan = planImport(snap);
  if (plan.balance.some((b) => !b.ok)) fail("the plan does not balance: " + plan.balance.filter((b) => !b.ok).map((b) => b.column).join(", "));

  const { count: existing } = await db.from("docs_units").select("id", { count: "exact", head: true }).eq("source", "import");
  if ((existing ?? 0) > 0) {
    if (!replace) fail(`${existing} imported rows already exist. Run again with --replace to delete them and load again.`);
    ok(await db.from("docs_review_items").delete().not("id", "is", null), "clearing review items");
    ok(await db.from("docs_handoff_events").delete().eq("source", "import"), "clearing handoff events");
    ok(await db.from("docs_units").delete().eq("source", "import"), "clearing imported rows"); // their history goes with them
    ok(await db.from("docs_import_runs").delete().not("id", "is", null), "clearing earlier runs"); // their raw cells go with them
    console.log(`cleared ${existing} earlier imported rows`);
  }

  const run = ok(await db.from("docs_import_runs").insert({ snapshot_name: snap.snapshot, snapshot_sha256: snap.sha256, mode: "apply", counts: plan.counts, report: { balance: plan.balance, notMigrated: plan.notMigrated } }).select("id").single(), "creating the run");
  const runId = run!.id;

  // 1. every non-empty cell, exactly as the snapshot has it
  for (const [tab, t] of Object.entries(snap.tabs)) {
    for (const part of chunks(t.cells, 1000)) {
      ok(await db.from("docs_import_cells").insert(part.map((c) => ({ run_id: runId, tab, row_no: c[0], col_no: c[1], col_letter: colLetter(c[1]), value: c[2], formula: c[4] }))), `raw cells of ${tab}`);
    }
  }

  // 2. the cars
  const idByRow = new Map<number, string>();
  for (const part of chunks(plan.units, 100)) {
    const rows = part.map((u) => ({ plate_no: u.plate_no, plate_display: u.plate_display, arrival_date: u.arrival_date, arrival_raw: u.arrival_raw, ...u.fields, source: "import", last_change_source: "import", import_run_id: runId, source_row: u.sourceRow, raw: u.raw }));
    const saved = ok(await db.from("docs_units").insert(rows).select("id, source_row"), "inserting cars");
    for (const s of saved ?? []) idByRow.set(s.source_row as number, s.id as string);
  }

  // 3. what the staff must look at
  const reviews = plan.issues.map((i) => ({ unit_id: i.sourceRow ? idByRow.get(i.sourceRow) ?? null : null, plate_no: i.plate, kind: i.kind, message: i.message, source_row: i.sourceRow, import_run_id: runId }));
  for (const part of chunks(reviews, 200)) ok(await db.from("docs_review_items").insert(part), "inserting review items");

  // 4. the handoff steps (to the current arrival of the plate)
  const current = new Map<string, { id: string; date: string }>();
  for (const u of plan.units) { const id = idByRow.get(u.sourceRow)!; const d = u.arrival_date ?? ""; const c = current.get(u.plate_no); if (!c || d >= c.date) current.set(u.plate_no, { id, date: d }); }
  const events = plan.events.map((e) => ({ unit_id: current.get(e.plate)?.id ?? null, plate_no: e.plate, event: e.event, event_date: e.date, person: e.person, original_text: e.original, source: "import", tab: e.tab }));
  for (const part of chunks(events, 200)) ok(await db.from("docs_handoff_events").insert(part), "inserting handoff events");

  // ---------- the check: what is in the database must equal what the snapshot says ----------
  console.log("\nVERIFY");
  let bad = 0;
  const check = (what: string, expected: number, actual: number | null) => { const good = expected === actual; if (!good) bad++; console.log(`${good ? "ok " : "BAD"} ${what}: expected ${expected}, database ${actual}`); };
  const count = async (table: string, f?: (q: any) => any) => { const q = db.from(table).select("*", { count: "exact", head: true }); const r = await (f ? f(q) : q); if (r.error) fail(`${table}: ${r.error.message}`); return r.count as number; }; // eslint-disable-line @typescript-eslint/no-explicit-any
  check("raw cells", Object.values(snap.tabs).reduce((n, t) => n + t.cells.length, 0), await count("docs_import_cells", (q) => q.eq("run_id", runId)));
  check("cars", plan.units.length, await count("docs_units"));
  check("distinct plates", plan.counts.distinctPlates, (await count("docs_units_current")));
  check("review items", plan.issues.length, await count("docs_review_items"));
  check("handoff events", plan.events.length, await count("docs_handoff_events"));
  check("history rows (one per car created)", plan.units.length, await count("docs_unit_history"));
  for (const b of plan.balance) {
    if (b.target === "plate_no" || b.target === "arrival_date") continue;
    // a blank classification is stored as "Not classified (legacy)", so only the real ones are counted
    check(`column ${b.column} (${b.letter}) filled`, b.inDatabase, await count("docs_units", (q) => (b.target === "classification" ? q.neq("classification", "Not classified (legacy)") : q.not(b.target, "is", null))));
  }

  // the sheet's own COMPLETE DOCS? column against the database's rule (Repo (bank) differs on purpose: it now needs the secretary papers)
  const tab = snap.tabs["DOCS 2026"];
  let aaCol = 0; for (const c of tab.cells) if (c[0] === 1 && c[2].trim().toUpperCase() === "COMPLETE DOCS?") aaCol = c[1];
  const sheetAA = new Map<number, string>(), typedAA = new Set<number>();
  for (const c of tab.cells) if (c[1] === aaCol && c[0] > 1) { sheetAA.set(c[0], c[2].trim()); if (!c[4]) typedAA.add(c[0]); } // a cell with no formula was typed over by a person
  const comp = ok(await db.from("docs_complete").select("id, complete_docs"), "reading docs_complete");
  const rowById = new Map([...idByRow].map(([r, id]) => [id, r]));
  const cls = new Map(plan.units.map((u) => [u.sourceRow, u.fields.classification]));
  let same = 0, repoDiffer = 0; const differ: string[] = []; const typedOver: string[] = [];
  for (const c of comp ?? []) {
    const r = rowById.get(c.id as string)!; const sheet = sheetAA.get(r) ?? ""; const mine = (c.complete_docs as string | null) ?? "";
    if (sheet === mine) same++;
    else if (cls.get(r) === "Repo (bank)") repoDiffer++;
    else if (typedAA.has(r)) typedOver.push(`row ${r}: the sheet's COMPLETE DOCS? was typed over by hand ("${sheet}"); the rule says "${mine || "(blank)"}"`);
    else differ.push(`row ${r} (${cls.get(r)}): sheet "${sheet}", database "${mine}"`);
  }
  console.log(`COMPLETE rule: ${same} rows agree with the sheet, ${repoDiffer} Repo (bank) rows differ on purpose, ${differ.length} unexplained differences`);
  for (const d of differ.slice(0, 15)) console.log("  ", d);
  if (typedOver.length) console.log(`${typedOver.length} rows where somebody typed over the formula in the sheet (the database uses the rule):\n   ${typedOver.join("\n   ")}`);
  if (differ.length) bad++;

  console.log(bad ? `\n${bad} CHECK(S) FAILED: do not use this import` : "\nALL CHECKS PASSED");
  process.exit(bad ? 1 : 0);
}
main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
