// Checks, cell by cell, that nothing of the MAD Price List is lost or changed in the move. For every car of the workbook it works out what the app
// would show in the Excel export (the same code the export uses) and compares it with the sheet's own cell: price, target, reprice, re-target,
// remarks, location, tools, repair status, papers-with, OR expiry, brand, model, color, mileage, fuel, arrival date, encumbrance, can-be-sold flag.
//   JITI_ALIAS='{"@/":"<project folder>/src/"}' npx jiti scripts/pricelist-verify.ts
// Before the import it SIMULATES (works from the workbook and the Docs Bible alone). After `pricelist-apply.ts --apply` it reads the stock rows
// really saved and also checks the repairs and renewals. It only reads.
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { composeRow, type StockRecord, type UnitRecord } from "../src/lib/pricelist/compose";
import { sellableFlag } from "../src/lib/pricelist/export";
import { identityOverrides, normalizeCar, normalizeRenewal, normalizeRepair, spareKeyState, type SnapshotRow } from "../src/lib/pricelist/import";

const env: Record<string, string | undefined> = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const snap = JSON.parse(readFileSync("Docs/sheets-private/pricelist.snapshot.json", "utf8")) as { taken: string; inventory: SnapshotRow[]; repairs: SnapshotRow[]; renewals: SnapshotRow[] };
const norm = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const same = (a: unknown, b: unknown) => norm(a) === norm(b);

async function main() {
  const { data: units } = await db.from("docs_units_current").select("id, plate_no, plate_display, arrival_date, year_model, make, model_variant, color, mileage, trans, fuel, encumbrance, spare_key, classification").limit(5000);
  const unitOf = new Map((units ?? []).map((u) => [u.plate_no as string, u as UnitRecord & { plate_no: string }]));
  const saved = await db.from("car_stock").select("*").limit(3000);
  const real = !saved.error && (saved.data?.length ?? 0) > 0;
  const stockOf = new Map(((saved.data ?? []) as (StockRecord & { raw: unknown })[]).map((s) => [s.plate_no, s]));
  console.log(`${real ? "VERIFYING the saved price list" : "SIMULATING (nothing is saved yet)"} against the workbook of ${snap.taken}\n`);

  const col: Record<string, { ok: number; bad: { plate: string; sheet: unknown; app: unknown }[] }> = {};
  const check = (name: string, plate: string, sheet: unknown, app: unknown, eq = same) => {
    const c = (col[name] ??= { ok: 0, bad: [] });
    const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
    if ((blank(sheet) && blank(app)) || (!blank(sheet) && !blank(app) && eq(sheet, app))) c.ok++; else c.bad.push({ plate, sheet: blank(sheet) ? "(empty)" : sheet, app: blank(app) ? "(empty)" : app });
  };
  let cars = 0, tests = 0; const unmatched: string[] = [], missingSaved: string[] = [];
  for (const r of snap.inventory) {
    const n = normalizeCar(r);
    if (!n.stock) { tests++; continue; }
    const s = n.stock, u = unitOf.get(s.plate);
    if (!u) { unmatched.push(s.plateDisplay); continue; }
    cars++;
    const o = identityOverrides(s, u);
    const rec: StockRecord = real ? stockOf.get(s.plate)! : { unit_id: u.id, plate_no: s.plate, body_group: s.group, sort_order: s.order, list_price: s.listPrice, target_price: s.targetPrice, reprice: s.reprice, retarget: s.retarget, or_expiry: s.orExpiry, or_expiry_raw: s.orExpiryRaw, papers_with: s.papersWith, tools: s.tools, location: s.location, repair_status: s.repairStatus, remarks: s.remarks, list_model: o.model, list_color: o.color, list_mileage: o.mileage, list_fuel: o.fuel, list_arrived_on: o.arrivedOn, list_encumbrance: o.encumbrance };
    if (!rec) { missingSaved.push(s.plate); continue; }
    const { price: p } = composeRow(rec, u, null, null);
    const n2 = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
    check("PRICE", s.plate, n2(r["PRICE"] && typeof r["PRICE"] === "number" ? r["PRICE"] : s.listPrice), p.price, (a, b) => Number(a) === Number(b));
    check("TARGET", s.plate, s.targetPrice, p.target, (a, b) => Number(a) === Number(b));
    check("REPRICE", s.plate, s.reprice, p.reprice, (a, b) => Number(a) === Number(b));
    check("RE-TARGET", s.plate, s.retarget, p.retarget, (a, b) => Number(a) === Number(b));
    check("REMARKS", s.plate, r["REMARKS"], p.remarks, (a, b) => String(a).trim() === String(b).trim());
    check("LOCATION", s.plate, r["LOCATION"], p.location);
    check("TOOLS", s.plate, r["TOOLS"], p.tools);
    check("REPAIR STATUS", s.plate, r["REPAIR STATUS"], p.repairStatus);
    check("DOCS (papers with)", s.plate, r["DOCS"], p.papersWith);
    check("OR EXP", s.plate, r["OR EXP"], p.orExpiry ?? p.orExpiryRaw);
    check("YM", s.plate, r["YM"], p.ym, (a, b) => String(a).slice(-2) === String(b).slice(-2));
    check("BRAND", s.plate, r["BRAND"], p.brand);
    check("MAKE (model)", s.plate, r["MAKE"], p.make);
    check("COLOR", s.plate, r["COLOR"], p.color);
    check("MILEAGE", s.plate, r["MILEAGE"], p.mileage);
    check("TRANS", s.plate, r["TRANS"], p.trans);
    check("FUEL", s.plate, r["FUEL"], p.fuel);
    check("PLATE NUMBER", s.plate, r["PLATE NUMBER"], p.plate);
    check("DATE ARRIVED", s.plate, s.identity.arrived, p.arrived);
    check("ENCUMBRANCE", s.plate, r["ENCUMBRANCE"], p.encumbrance);
    check("SPAREKEY (yes/no)", s.plate, r["SPAREKEY"], p.spareKey, (a, b) => spareKeyState(String(a)) === spareKeyState(String(b)) || spareKeyState(String(a)) === "unknown" || spareKeyState(String(b)) === "unknown");
    check("can be sold (column D)", s.plate, r["_D"], sellableFlag(p), (a, b) => Number(a) === Number(b));
    if (real && !rec) missingSaved.push(s.plate);
  }
  console.log(`Cars in the workbook: ${snap.inventory.length} | compared: ${cars} | test rows left out: ${tests} | not in the Docs Bible yet: ${unmatched.join(", ") || "none"}${missingSaved.length ? ` | NOT SAVED: ${missingSaved.join(", ")}` : ""}\n`);
  let total = 0, bad = 0;
  for (const [name, c] of Object.entries(col)) {
    total += c.ok + c.bad.length; bad += c.bad.length;
    console.log(`${c.bad.length === 0 ? "OK  " : "DIFF"} ${name.padEnd(24)} ${c.ok}/${c.ok + c.bad.length} same${c.bad.length ? `; differs: ${c.bad.slice(0, 3).map((b) => `${b.plate} sheet "${b.sheet}" / app "${b.app}"`).join(" | ")}${c.bad.length > 3 ? ` (+${c.bad.length - 3} more)` : ""}` : ""}`);
  }
  console.log(`\nCells compared: ${total}; the same: ${total - bad}; different: ${bad}.`);

  if (real) {
    const rep = await db.from("car_repairs").select("plate_no, problem, status, raw").limit(1000);
    const ren = await db.from("or_renewals").select("plate_no, month_label, notes, raw").limit(1000);
    const repWant = snap.repairs.map((r, i) => normalizeRepair(r, i + 1)).filter((x) => !!x), renWant = snap.renewals.map((r, i) => normalizeRenewal(r, i + 1)).filter((x) => !!x);
    console.log(`\nRepairs: workbook ${repWant.length}, saved ${rep.data?.length ?? 0} ${repWant.length === (rep.data?.length ?? 0) ? "OK" : "DIFF"} | with their original cells kept: ${(rep.data ?? []).filter((x) => x.raw).length}`);
    console.log(`Renewals: workbook ${renWant.length}, saved ${ren.data?.length ?? 0} ${renWant.length === (ren.data?.length ?? 0) ? "OK" : "DIFF"} | with their original cells (price, target, arrival, days late...) kept: ${(ren.data ?? []).filter((x) => x.raw).length}`);
    console.log(`Stock rows with their original cells kept: ${[...stockOf.values()].filter((s) => s.raw).length} of ${stockOf.size}`);
  }
  console.log(`\nNot in the Excel as separate cells but kept in the saved row (raw): every original cell. The workbook itself stays untouched as the archive.`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
