// The 2026 sold list (the SOLD INFORMATION workbook) into MAD, as one record per sale, linked by plate to the car and to its transfer.
// Without --apply this is the DRY RUN: it reads the snapshot and the database and writes nothing to the database. It prints what would happen and writes
// two files in Docs/sheets-private/ (git ignores them): the whole plan (sold-dryrun.json) and what a person has to look at (sold-flags.csv).
// With --apply (after migration 45) it does it. It is safe to run again: a sale is found by its key, and a record a person changed in the app
// (edited_in_app) is never overwritten. A car MAD does not have gets no car record: the sale keeps the car as the sheet described it.
//   python3 scripts/sold-snapshot.py "/path/to/SOLD INFORMATION .xlsx"
//   JITI_ALIAS='{"@/":"<project folder>/src/"}' npx jiti scripts/sold-import.ts           dry run
//   JITI_ALIAS=... npx jiti scripts/sold-import.ts --apply
//   JITI_ALIAS=... npx jiti scripts/sold-import.ts --undo      puts back what --apply changed (from Docs/sheets-private/sold-before.json) and removes the records it made
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cleanPhone, edit, financingOf, fixMake, fuelOf, liaisonIn, looksLikeOffice, normPlate, officeKey, originalsAt, parseSoldDate, plateProblem, salesperson, stageOf, yearModel, type TransferStage } from "../src/lib/sold/parse";

const apply = process.argv.includes("--apply"), undo = process.argv.includes("--undo");
const env: Record<string, string | undefined> = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

type Cell = string | null;
interface FtRow { row: number; block: string | null; color: string; [col: string]: string | number | null }
interface SoldRow { row: number; YEAR: Cell; MAKE: Cell; MODEL: Cell; PLATE: Cell; FUEL: Cell; COLOR: Cell; DATE: Cell; PRICE: Cell; BUYER: Cell; CONTACT: Cell; ADDRESS: Cell; SALES: Cell; TRANSFER: Cell; LIAISON: Cell; REMARKS: Cell }
const snap = JSON.parse(readFileSync("Docs/sheets-private/sold-information.snapshot.json", "utf8")) as { for_transfer_2026: FtRow[]; sold_2026_tab: SoldRow[]; file: string; taken: string };
const s = (v: unknown): string | null => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());

interface Flag { source: string; row: number; plate: string; issue: string }
/** Plates the owner confirmed are typos on the sheet's side: the car is the MAD one (the typed plate is kept on the record). GNV2072 is a different car (another color). */
const PLATE_FIXES: Record<string, string> = { DDL5102: "DDL5012", NDZ2485: "NDZ2845", NDL1184: "NDL1284", NBK2751: "NDK2751" };
const KEEP_SEPARATE = new Set(["GNV2072"]);
const fullYear = (y: string | null) => { const n = Number(y); return Number.isFinite(n) && n > 0 ? String(n >= 1000 ? n : n <= 40 ? 2000 + n : 1900 + n) : null; };

interface Plan {
  key: string; carText: string | null; chassis: string | null; engine: string | null; plateOriginal: string | null; isReference: boolean; flags: string[]; raw: unknown;
  source: "transfer tab" | "SOLD 2026 tab"; row: number; plate: string; car: "in MAD" | "new car" | "decide"; near?: string;
  sale: { sold_on: string | null; price: number | null; buyer: string | null; contact: string | null; address: string | null; salesperson: string | null; route: "mad" | "client" | "unknown" };
  transfer: { stage: TransferStage; liaison: string | null; liaison_status: string | null; received_on: string | null; originals: string | null; financing: string | null; next_step: string | null; note: string | null; merges_existing: boolean };
  fill: Record<string, string>; fix: Record<string, string>;
}

async function readAll<T>(table: string, cols: string): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; ; p++) { const r = await db.from(table).select(cols).range(p * 1000, p * 1000 + 999); if (r.error) throw r.error; out.push(...((r.data ?? []) as T[])); if ((r.data ?? []).length < 1000) break; }
  return out;
}

async function main() {
  if (undo) return undoImport();
  type Unit = { id: string; arrival_date: string | null; state_for: string | null; state_on: string | null; plate_no: string; make: string | null; model_variant: string | null; year_model: string | null; color: string | null; fuel: string | null; trans: string | null; mileage: string | null; reg_owner_name: string | null; mo_file: string | null; stock_state: string | null; archived_at: string | null };
  const units = (await readAll<Unit>("docs_units", "id, arrival_date, state_for, state_on, plate_no, make, model_variant, year_model, color, fuel, trans, mileage, reg_owner_name, mo_file, stock_state, archived_at")).filter((u) => !u.archived_at).sort((a, b) => (a.arrival_date ?? "").localeCompare(b.arrival_date ?? "")); // the latest arrival of a plate is the current car
  const unitOf = new Map(units.map((u) => [u.plate_no, u]));
  const known = [...new Set(units.map((u) => (u.make ?? "").toUpperCase()).filter(Boolean))];
  const transfers = await readAll<{ plate_no: string; note: string | null }>("car_transfers", "plate_no, note");
  const transferOf = new Set(transfers.map((t) => t.plate_no));
  const flags: Flag[] = [], plans: Plan[] = [];
  let inferredLiaison = 0;
  const flag = (source: string, row: number, plate: string, issue: string) => flags.push({ source, row, plate, issue });

  const nearPlate = (plate: string, make: string | null) => {
    const m = fixMake(make, known).replace(/[^A-Z]/g, "");
    return units.filter((u) => edit(u.plate_no, plate, 2) <= 2 && (u.make ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) === m.slice(0, 4)).map((u) => u.plate_no)[0];
  };

  // ---- the transfer tab (the live tracker) ----
  for (const r of snap.for_transfer_2026) {
    let plate = normPlate(r.E), original: string | null = null; const src = "transfer tab";
    const pp = plateProblem(r.E);
    if (pp) { flag(src, r.row, String(r.E), `plate: ${pp}. The row is left out until a person fixes the plate.`); continue; }
    if (PLATE_FIXES[plate]) { original = plate; flag(src, r.row, PLATE_FIXES[plate], `plate: the sheet had ${plate}; it was corrected to ${PLATE_FIXES[plate]}, the car MAD has. Check it against the OR/CR.`); plate = PLATE_FIXES[plate]; }
    const u = unitOf.get(plate), near = u || KEEP_SEPARATE.has(plate) ? undefined : nearPlate(plate, s(r.C));
    const d = parseSoldDate(r.W);
    if (d.problem) flag(src, r.row, plate, `sold date: ${d.problem}`); else if (!d.date) flag(src, r.row, plate, "no sold date");
    const sp = salesperson(r.A); if (sp.problem) flag(src, r.row, plate, sp.problem); else if (!sp.name) flag(src, r.row, plate, "no sales person");
    const ph = cleanPhone(r.Y); if (ph.problem) flag(src, r.row, plate, `contact: ${ph.problem}`);
    const price = Number(r.V); if (!Number.isFinite(price) || price <= 0) flag(src, r.row, plate, "no agreed price");
    if (!s(r.X)) flag(src, r.row, plate, "no buyer name");
    const notes = [s(r.AF), s(r.AG), s(r.AH), s(r.AI), s(r.AJ), s(r.AA)];
    const named = s(r.AB)?.toUpperCase() ?? null, inferred = named ? null : liaisonIn(...notes);
    const liaison = named ?? inferred;
    const route: Plan["sale"]["route"] = liaison ? "mad" : /CLIENT/i.test(notes.join(" ")) ? "client" : "unknown";
    if (inferred) inferredLiaison++;
    const fill: Record<string, string> = {}, fix: Record<string, string> = {};
    if (u) {
      const owner = s(r.P), office = s(r.R);
      const letters = (x: unknown) => String(x ?? "").toUpperCase().replace(/[^A-Z]/g, "");
      const swapped = owner && office && looksLikeOffice(u.reg_owner_name) && !looksLikeOffice(u.mo_file) && (officeKey(u.reg_owner_name) === officeKey(office) || edit(letters(u.mo_file), letters(owner), 3) <= 3);
      if (swapped) { fix.reg_owner_name = owner!; fix.mo_file = office!; }
      else {
        if (!s(u.reg_owner_name) && owner) fill.reg_owner_name = owner;
        if (!s(u.mo_file) && office) fill.mo_file = office;
      }
      if (!s(u.year_model) && yearModel(r.B)) fill.year_model = yearModel(r.B)!;
      if (s(u.year_model) && yearModel(r.B) && yearModel(u.year_model) !== yearModel(r.B)) flag(src, r.row, plate, `year: the sheet says ${yearModel(r.B)}, MAD says ${yearModel(u.year_model)}. MAD is kept.`);
      if (!s(u.fuel) && fuelOf(r.F)) fill.fuel = fuelOf(r.F)!;
      else if (fuelOf(u.fuel) && fuelOf(r.F) && fuelOf(u.fuel) !== fuelOf(r.F)) flag(src, r.row, plate, `fuel: the sheet says ${fuelOf(r.F)}, MAD says ${fuelOf(u.fuel)}. MAD is kept.`);
      if (!s(u.color) && s(r.I)) fill.color = s(r.I)!;
      if (!s(u.trans) && s(r.G)) fill.trans = s(r.G)!;
      if (!s(u.mileage) && s(r.H)) fill.mileage = s(r.H)!;
    }
    if (s(r.J)) fill.chassis_no = s(r.J)!;   // MAD has no chassis or engine number yet: new columns
    if (s(r.K)) fill.engine_no = s(r.K)!;
    const carText = [fullYear(yearModel(r.B)), fixMake(r.C, known), s(r.D), s(r.I), s(r.F)].filter(Boolean).join(" ");
    plans.push({
      key: `ft|${plate}|${d.date ?? `row${r.row}`}|${normPlate(s(r.X)).slice(0, 12)}`, carText, chassis: s(r.J), engine: s(r.K), plateOriginal: original, isReference: false, flags: [], raw: r,
      source: src, row: r.row, plate, car: u ? "in MAD" : near ? "decide" : "new car", near,
      sale: { sold_on: d.date, price: Number.isFinite(price) && price > 0 ? price : null, buyer: s(r.X), contact: ph.value, address: s(r.Z), salesperson: sp.name, route },
      transfer: { stage: stageOf(r.color, s(r.AD)), liaison, liaison_status: s(r.AD), received_on: parseSoldDate(r.AC).date, originals: originalsAt(...notes), financing: financingOf(...notes), next_step: s(r.AI), note: [s(r.AH), s(r.AG), s(r.AJ), s(r.AA)].filter(Boolean).join(" | ") || null, merges_existing: transferOf.has(plate) },
      fill, fix,
    });
  }

  // ---- the older SOLD 2026 tab (kept for reference: the same sale, when the transfer tab has no row) ----
  const have = new Set(plans.map((p) => p.plate));
  const skipped: string[] = [];
  for (const r of snap.sold_2026_tab) {
    let plate = normPlate(r.PLATE), original: string | null = null; const src = "SOLD 2026 tab";
    if (have.has(plate)) { skipped.push(plate); continue; }
    const pp = plateProblem(r.PLATE); if (pp) { flag(src, r.row, String(r.PLATE), `plate: ${pp}`); continue; }
    if (PLATE_FIXES[plate]) { original = plate; flag(src, r.row, PLATE_FIXES[plate], `plate: the sheet had ${plate}; it was corrected to ${PLATE_FIXES[plate]}, the car MAD has. Check it against the OR/CR.`); plate = PLATE_FIXES[plate]; }
    const u = unitOf.get(plate), near = u || KEEP_SEPARATE.has(plate) ? undefined : nearPlate(plate, r.MAKE);
    const d = parseSoldDate(r.DATE); if (d.problem) flag(src, r.row, plate, `sold date: ${d.problem}`);
    const sp = salesperson(r.SALES); if (sp.problem) flag(src, r.row, plate, sp.problem); else if (!sp.name) flag(src, r.row, plate, "no sales person");
    const ph = cleanPhone(r.CONTACT);
    const price = Number(r.PRICE); if (!Number.isFinite(price) || price <= 0) flag(src, r.row, plate, "no agreed price");
    const liaison = /^(JEP|LEO)$/i.test(r.LIAISON ?? "") ? r.LIAISON!.toUpperCase() : null;
    flag(src, r.row, plate, "the transfer status is not known (this tab is old): a person checks it");
    const carText = [fullYear(yearModel(r.YEAR)), fixMake(r.MAKE, known), s(r.MODEL), s(r.COLOR), s(r.FUEL)].filter(Boolean).join(" ");
    plans.push({
      key: `s26|${plate}|${d.date ?? `row${r.row}`}|${normPlate(s(r.BUYER)).slice(0, 12)}`, carText, chassis: null, engine: null, plateOriginal: original, isReference: true, flags: [], raw: r,
      source: src, row: r.row, plate, car: u ? "in MAD" : near ? "decide" : "new car", near,
      sale: { sold_on: d.date, price: Number.isFinite(price) && price > 0 ? price : null, buyer: s(r.BUYER), contact: ph.value, address: s(r.ADDRESS), salesperson: sp.name, route: /^MAD$/i.test(r.TRANSFER ?? "") ? "mad" : /^CLIENT$/i.test(r.TRANSFER ?? "") ? "client" : "unknown" },
      transfer: { stage: "unknown", liaison, liaison_status: null, received_on: null, originals: originalsAt(r.REMARKS), financing: financingOf(r.REMARKS), next_step: null, note: s(r.REMARKS), merges_existing: transferOf.has(plate) },
      fill: {}, fix: {},
    });
  }

  for (const p of plans) p.flags = flags.filter((f) => f.source === p.source && f.row === p.row).map((f) => f.issue);

  // ---- the report ----
  const by = <T,>(list: T[], f: (x: T) => string) => Object.fromEntries([...list.reduce((m, x) => m.set(f(x), (m.get(f(x)) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]));
  const ft = plans.filter((p) => p.source === "transfer tab"), old = plans.filter((p) => p.source === "SOLD 2026 tab");
  const dupPlates = Object.entries(by(plans, (p) => p.plate)).filter(([, n]) => n > 1);
  console.log(`Snapshot of "${snap.file}" (${snap.taken}).`);
  console.log(`\nSALES: ${plans.length} to create  (${ft.length} from the transfer tab, ${old.length} from the old SOLD 2026 tab; ${skipped.length} old-tab row(s) skipped because the transfer tab has the plate)`);
  console.log(` the car:     `, by(plans, (p) => p.car));
  console.log(` stage:       `, by(plans, (p) => p.transfer.stage));
  console.log(` route:       `, by(plans, (p) => p.sale.route));
  console.log(` liaison:     `, by(plans, (p) => p.transfer.liaison ?? "(none)"), `(${inferredLiaison} read from the notes where the column was empty)`);
  console.log(` financing:   `, by(plans, (p) => p.transfer.financing ?? "(none)"));
  console.log(` originals:   `, by(plans, (p) => p.transfer.originals ?? "(not said)"));
  console.log(` sales person:`, by(plans, (p) => p.sale.salesperson ?? "(none)"));
  console.log(` sold on:      with a date ${plans.filter((p) => p.sale.sold_on).length}, without ${plans.filter((p) => !p.sale.sold_on).length}`);
  console.log(` price:        filled ${plans.filter((p) => p.sale.price).length}, missing ${plans.filter((p) => !p.sale.price).length}`);
  console.log(` a plate sold more than once (kept as separate sales):`, dupPlates.map(([p, n]) => `${p} ×${n}`).join(", ") || "none");
  console.log(` transfers already in MAD that these merge into: ${plans.filter((p) => p.transfer.merges_existing).length}`);
  const fills = ft.flatMap((p) => Object.keys(p.fill));
  console.log(`\nWHAT IS FILLED INTO CARS MAD ALREADY HAS (only where MAD is empty): `, by(fills.map((f) => ({ f })), (x) => x.f));
  console.log(`WHAT IS FIXED (MAD is wrong and the sheet proves it): ${ft.filter((p) => p.fix.reg_owner_name).length} car(s) with the owner and the CR office swapped`);
  console.log(`\nSALES OF CARS MAD HAS NO RECORD OF (no car record is made; the sale keeps the car as the sheet described it): ${plans.filter((p) => p.car === "new car").length}`);
  console.log(`WAITING FOR A DECISION (plate almost like a MAD car):`);
  for (const p of plans.filter((x) => x.car === "decide")) { const u = unitOf.get(p.near!); const row = p.source === "transfer tab" ? snap.for_transfer_2026.find((x) => x.row === p.row) : null, old = p.source === "transfer tab" ? null : snap.sold_2026_tab.find((x) => x.row === p.row); console.log(`  ${p.plate} (${p.source}, row ${p.row}, buyer ${p.sale.buyer ?? "?"}${row ? `, ${row.B} ${row.C} ${row.D} ${row.I}` : old ? `, ${old.YEAR} ${old.MAKE} ${old.MODEL} ${old.COLOR}` : ""})  ~  MAD ${p.near}: ${[u?.year_model, u?.make, u?.model_variant, u?.color].filter(Boolean).join(" ")}, ${u?.stock_state}`); }
  console.log(`\nFLAGGED FOR A PERSON: ${flags.length} item(s)`, by(flags, (f) => f.issue.replace(/"[^"]*"/g, "").replace(/\d+/g, "#").slice(0, 60)));
  writeFileSync("Docs/sheets-private/sold-dryrun.json", JSON.stringify({ plans, flags, skipped }, null, 1));
  writeFileSync("Docs/sheets-private/sold-flags.csv", ["source,row,plate,issue", ...flags.map((f) => [f.source, f.row, f.plate, `"${f.issue.replace(/"/g, "'")}"`].join(","))].join("\n"));
  console.log("\nWrote Docs/sheets-private/sold-dryrun.json and sold-flags.csv.");
  if (!apply) { console.log("This was a dry run: nothing was written to the database. Add --apply to do it (after migration 45)."); return; }
  await applyPlans(plans, unitOf, new Map(units.map((u) => [u.plate_no, u])));
}

async function undoImport() {
  if (!existsSync("Docs/sheets-private/sold-before.json")) throw new Error("There is no sold-before.json: nothing to undo.");
  const before = JSON.parse(readFileSync("Docs/sheets-private/sold-before.json", "utf8")) as { units: ({ id: string } & Record<string, unknown>)[]; transfers: ({ id: string } & Record<string, unknown>)[] };
  const had = new Set(before.transfers.map((t) => t.id));
  const now = await readAll<{ id: string; source_key: string | null }>("car_transfers", "id, source_key");
  const made = now.filter((t) => t.source_key && !had.has(t.id)).map((t) => t.id);
  for (let i = 0; i < made.length; i += 100) { const r = await db.from("car_transfers").delete().in("id", made.slice(i, i + 100)); if (r.error) throw r.error; }
  for (const t of before.transfers) { const { id, ...rest } = t; const r = await db.from("car_transfers").update(rest).eq("id", id); if (r.error) throw r.error; }
  for (const u of before.units) { const { id, ...rest } = u; const r = await db.from("docs_units").update({ ...rest, last_change_source: "sold-import undone" }).eq("id", id); if (r.error) throw r.error; }
  console.log(`Undone: ${made.length} record(s) removed, ${before.transfers.length} transfer(s) and ${before.units.length} car(s) put back as they were.`);
}

type UnitRow = { id: string; state_for: string | null; state_on: string | null; plate_no: string };
async function applyPlans(plans: Plan[], unitOf: Map<string, { stock_state: string | null; mileage: string | null }>, units: Map<string, UnitRow>) {
  const probe = await db.from("car_transfers").select("source_key", { head: true, count: "exact" });
  if (probe.error) throw new Error("Migration 45 is not applied yet: the sold list columns are missing. Apply it first.");
  const have = await readAll<{ id: string; plate_no: string; source_key: string | null; edited_in_app: boolean; source: string; note: string | null; particular: string | null; financing: string | null; buyer: string | null; address: string | null; contact: string | null; liaison: string | null; sales: string | null }>(
    "car_transfers", "id, plate_no, source_key, edited_in_app, source, note, particular, financing, buyer, address, contact, liaison, sales");
  // what is about to change, kept so --undo can put it back
  const touched = new Set(plans.filter((p) => units.get(p.plate)).map((p) => units.get(p.plate)!.id));
  const beforeUnits: Record<string, unknown>[] = [];
  for (const id of touched) { const r = await db.from("docs_units").select("id, reg_owner_name, mo_file, year_model, fuel, color, trans, mileage, chassis_no, engine_no, state_for, state_on").eq("id", id).single(); if (r.data) beforeUnits.push(r.data); }
  const beforeTransfers = await readAll<Record<string, unknown>>("car_transfers", "*");
  writeFileSync("Docs/sheets-private/sold-before.json", JSON.stringify({ takenAt: new Date().toISOString(), units: beforeUnits, transfers: beforeTransfers }));
  const byKey = new Map(have.filter((t) => t.source_key).map((t) => [t.source_key!, t]));
  const waiting = new Map<string, typeof have>(); // transfers from the old ORCR WITH MAD tab: a sale merges into the one of its plate
  for (const t of have.filter((x) => !x.source_key && x.source === "import")) waiting.set(t.plate_no, [...(waiting.get(t.plate_no) ?? []), t]);
  const latest = new Map<string, string>(); // the car's latest sale: its date and seller go on the car
  for (const p of plans) if (p.sale.sold_on && (!latest.has(p.plate) || p.sale.sold_on > latest.get(p.plate)!)) latest.set(p.plate, p.sale.sold_on);
  const done = { created: 0, merged: 0, updated: 0, kept: 0, cars: 0 };
  for (const p of plans) {
    if (p.car === "decide") { console.log(`  skipped ${p.plate}: waiting for a decision`); continue; }
    const u = units.get(p.plate);
    if (u) {
      const patch: Record<string, string | null> = { ...p.fill, ...p.fix };
      if (p.sale.sold_on && latest.get(p.plate) === p.sale.sold_on && unitOf.get(p.plate)?.stock_state === "Sold") {
        if (!u.state_on) patch.state_on = p.sale.sold_on;
        if (!u.state_for && p.sale.salesperson) patch.state_for = p.sale.salesperson;
      }
      if (Object.keys(patch).length) { const r = await db.from("docs_units").update({ ...patch, last_change_source: "sold-import" }).eq("id", u.id); if (r.error) throw new Error(`${p.plate}: ${r.error.message}`); done.cars++; }
    }
    const note = p.transfer.note;
    const fields = {
      plate_no: p.plate, unit_id: u?.id ?? null, car_text: p.carText, financing: p.transfer.financing, buyer: p.sale.buyer?.toUpperCase() ?? null, address: p.sale.address?.toUpperCase() ?? null, contact: p.sale.contact,
      liaison: p.transfer.liaison, sales: p.sale.salesperson, note, sold_on: p.sale.sold_on, agreed_price: p.sale.price, route: p.sale.route, stage: p.transfer.stage,
      liaison_status: p.transfer.liaison_status, liaison_received_on: p.transfer.received_on, originals_at: p.transfer.originals, next_step: p.transfer.next_step,
      chassis_no: p.chassis, engine_no: p.engine, is_reference: p.isReference, flags: p.flags, plate_original: p.plateOriginal, source: "import", sheet_row: p.row, raw: p.raw, source_key: p.key,
      ...(p.sale.route === "mad" ? { particular: "ORCR TRANSFER" } : {}),
    };
    const mine = byKey.get(p.key);
    if (mine) {
      if (mine.edited_in_app) { done.kept++; continue; }
      const r = await db.from("car_transfers").update(fields).eq("id", mine.id); if (r.error) throw new Error(`${p.plate}: ${r.error.message}`); done.updated++; continue;
    }
    const old = waiting.get(p.plate)?.shift();
    if (old) {
      const keep = (a: string | null, b: string | null) => (a && a.trim() ? a : b);
      const merged = { ...fields, particular: keep(old.particular, fields.particular ?? null), financing: keep(old.financing, fields.financing), buyer: keep(old.buyer, fields.buyer), address: keep(old.address, fields.address),
        contact: keep(old.contact, fields.contact), liaison: keep(old.liaison, fields.liaison), sales: keep(old.sales, fields.sales), note: [old.note, note].filter((x, i, a) => x && a.indexOf(x) === i).join(" | ") || null };
      const r = await db.from("car_transfers").update(merged).eq("id", old.id); if (r.error) throw new Error(`${p.plate}: ${r.error.message}`); done.merged++; continue;
    }
    const r = await db.from("car_transfers").insert(fields); if (r.error) throw new Error(`${p.plate}: ${r.error.message}`); done.created++;
  }
  await db.from("audit_logs").insert({ actor_id: null, action: "sold.import", entity: "car_transfers", entity_id: null, after: done });
  console.log(`\nDone. Records created ${done.created}, merged into an old transfer ${done.merged}, updated ${done.updated}, left alone because a person changed them ${done.kept}; cars of MAD filled or fixed ${done.cars}.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
