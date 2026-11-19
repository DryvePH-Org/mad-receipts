// Takes the MAD Price List (INVENTORY 2026, REPAIRS REPORT, FOR RENEWAL) into the database, from the snapshot made by scripts/pricelist-snapshot.py.
// The Docs Bible rows are never changed except to FILL a blank spare key. Anything that needs a person goes on the review list.
//   npx jiti scripts/pricelist-apply.ts           shows what would happen (changes nothing; works before migration 35)
//   npx jiti scripts/pricelist-apply.ts --apply   writes it (needs migration 35); safe to run again: it replaces what an earlier run imported
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { identityOverrides, normalizeCar, normalizeRenewal, normalizeRepair, reviewNotes, type PriceIssue, type SnapshotRow } from "../src/lib/pricelist/import";

const apply = process.argv.includes("--apply");
const env: Record<string, string | undefined> = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const snap = JSON.parse(readFileSync("Docs/sheets-private/pricelist.snapshot.json", "utf8")) as { taken: string; inventory: SnapshotRow[]; repairs: SnapshotRow[]; renewals: SnapshotRow[] };

async function main() {
  console.log(`Snapshot of ${snap.taken}: ${snap.inventory.length} cars, ${snap.repairs.length} repairs, ${snap.renewals.length} renewals. ${apply ? "WRITING" : "Dry run, nothing is written."}`);
  const { data: units, error } = await db.from("docs_units_current").select("id, plate_no, year_model, make, model_variant, color, trans, fuel, spare_key, mileage, encumbrance, arrival_date").limit(5000);
  if (error) throw new Error(error.message);
  const unitOf = new Map((units ?? []).map((u) => [u.plate_no as string, u]));

  const issues: PriceIssue[] = [];
  const toSave: { unitId: string; row: Record<string, unknown>; spareKeyFill: string | null }[] = [];
  const skipped: string[] = [];
  for (const r of snap.inventory) {
    const n = normalizeCar(r);
    issues.push(...n.issues);
    if (!n.stock) { if (n.skipped === "test row") skipped.push(`${r["PLATE NUMBER"] ?? "(no plate)"} (row ${r._row}, test row)`); continue; }
    const s = n.stock, u = unitOf.get(s.plate);
    if (!u) { issues.push({ kind: "pricelist_unmatched", plate: s.plate, sourceRow: s.sourceRow, message: `${s.plateDisplay} is on the price list but not in the Docs Bible. Add the car with Add a car, then import again.` }); continue; }
    const notes = reviewNotes(s, u);
    if (notes.length) issues.push({ kind: "pricelist_differs", plate: s.plate, sourceRow: s.sourceRow, message: notes.join(" ") }); // one item per car
    const o = identityOverrides(s, u);
    toSave.push({
      unitId: u.id as string, spareKeyFill: !u.spare_key && s.identity.spareKey ? s.identity.spareKey : null,
      row: { unit_id: u.id, plate_no: s.plate, body_group: s.group, sort_order: s.order, list_price: s.listPrice, target_price: s.targetPrice, reprice: s.reprice, retarget: s.retarget,
        list_model: o.model, list_color: o.color, list_mileage: o.mileage, list_fuel: o.fuel, list_arrived_on: o.arrivedOn, list_encumbrance: o.encumbrance,
        or_expiry: s.orExpiry, or_expiry_raw: s.orExpiryRaw, papers_with: s.papersWith, tools: s.tools, location: s.location, repair_status: s.repairStatus, remarks: s.remarks,
        in_stock: true, source: "import", raw: r },
    });
  }
  const repairs = snap.repairs.map((r, i) => normalizeRepair(r, i + 1)).filter((x) => !!x);
  const renewals = snap.renewals.map((r, i) => normalizeRenewal(r, i + 1)).filter((x) => !!x);
  for (const x of renewals) if (x!.orExpiryRaw) issues.push({ kind: "pricelist_odd_value", plate: x!.plate, sourceRow: 0, message: `Renewal list: OR EXP "${x!.orExpiryRaw}" is not a clear date.` });

  const by = (k: string) => issues.filter((i) => i.kind === k).length;
  console.log(`\nCars to save: ${toSave.length} | left out: ${skipped.length ? skipped.join("; ") : "none"}`);
  console.log(`Spare keys to fill in the Docs Bible (blank there): ${toSave.filter((t) => t.spareKeyFill).length}`);
  console.log(`Repairs: ${repairs.length} | renewals: ${renewals.length}`);
  console.log(`Review list: ${issues.length} items (papers-with codes ${by("pricelist_docs_code")}, not in the Docs Bible ${by("pricelist_unmatched")}, differences ${by("pricelist_differs")}, odd values and dates ${by("pricelist_odd_value")})`);
  for (const i of issues.filter((i) => i.kind !== "pricelist_docs_code").slice(0, 25)) console.log(`  [${i.kind}] ${i.plate ?? ""} ${i.message}`);
  if (!apply) { console.log("\nNothing was written. Add --apply after migration 35 is applied."); return; }

  const probe = await db.from("car_stock").select("unit_id", { head: true, count: "exact" });
  if (probe.error) throw new Error(`The price list tables are not there yet (${probe.error.message}). Apply migration 35 first.`);
  for (let i = 0; i < toSave.length; i += 100) { const { error: e } = await db.from("car_stock").upsert(toSave.slice(i, i + 100).map((t) => t.row), { onConflict: "unit_id" }); if (e) throw new Error(`car_stock: ${e.message}`); }
  for (const t of toSave) if (t.spareKeyFill) { const { error: e } = await db.from("docs_units").update({ spare_key: t.spareKeyFill, last_change_source: "pricelist" }).eq("id", t.unitId).is("spare_key", null); if (e) console.log(`  spare key of ${t.unitId} not filled: ${e.message}`); }
  await db.from("car_repairs").delete().eq("source", "import");
  await db.from("or_renewals").delete().eq("source", "import");
  if (repairs.length) { const { error: e } = await db.from("car_repairs").insert(repairs.map((x) => ({ plate_no: x!.plate, ym: x!.ym, brand: x!.brand, problem: x!.problem, happened_on: x!.happenedOn, happened_raw: x!.happenedRaw, solution: x!.solution, supplier: x!.supplier, company: x!.company, est_timeline: x!.estTimeline, status: x!.status, bot_id: x!.botId, approved_by: x!.approvedBy, sort_order: x!.order, source: "import", raw: snap.repairs[x!.order - 1] }))); if (e) throw new Error(`car_repairs: ${e.message}`); }
  if (renewals.length) { const { error: e } = await db.from("or_renewals").insert(renewals.map((x) => ({ plate_no: x!.plate, month_label: x!.monthLabel, or_expiry: x!.orExpiry, or_expiry_raw: x!.orExpiryRaw, location: x!.location, notes: x!.notes, sort_order: x!.order, source: "import", raw: snap.renewals[x!.order - 1] }))); if (e) throw new Error(`or_renewals: ${e.message}`); }
  // the review list: what an earlier price list run left open is replaced, what the staff already settled stays settled
  await db.from("docs_review_items").delete().eq("status", "open").in("kind", ["pricelist_docs_code", "pricelist_unmatched", "pricelist_odd_value", "pricelist_differs"]);
  const rows = issues.map((i) => ({ plate_no: i.plate, kind: i.kind, message: `${i.sourceRow ? `Price list row ${i.sourceRow}: ` : ""}${i.message}`, unit_id: i.plate ? unitOf.get(i.plate)?.id ?? null : null }));
  for (let i = 0; i < rows.length; i += 100) { const { error: e } = await db.from("docs_review_items").insert(rows.slice(i, i + 100)); if (e) throw new Error(`review list: ${e.message}`); }
  console.log(`\nDone: ${toSave.length} cars, ${repairs.length} repairs, ${renewals.length} renewals, ${rows.length} review items.`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
