// The 2026 sold list (the SOLD INFORMATION workbook) into MAD, as one record per sale, linked by plate to the car and to its transfer.
// This is the DRY RUN: it reads the snapshot and the database and writes nothing to the database. It prints what would happen and writes two files
// in Docs/sheets-private/ (git ignores them): the whole plan (sold-dryrun.json) and what a person has to look at (sold-flags.csv).
//   python3 scripts/sold-snapshot.py "/path/to/SOLD INFORMATION .xlsx"
//   npx jiti scripts/sold-import.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { cleanPhone, edit, financingOf, fixMake, fuelOf, liaisonIn, looksLikeOffice, normPlate, officeKey, originalsAt, parseSoldDate, plateProblem, salesperson, stageOf, yearModel, type TransferStage } from "../src/lib/sold/parse";

const env: Record<string, string | undefined> = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

type Cell = string | null;
interface FtRow { row: number; block: string | null; color: string; [col: string]: string | number | null }
interface SoldRow { row: number; YEAR: Cell; MAKE: Cell; MODEL: Cell; PLATE: Cell; FUEL: Cell; COLOR: Cell; DATE: Cell; PRICE: Cell; BUYER: Cell; CONTACT: Cell; ADDRESS: Cell; SALES: Cell; TRANSFER: Cell; LIAISON: Cell; REMARKS: Cell }
const snap = JSON.parse(readFileSync("Docs/sheets-private/sold-information.snapshot.json", "utf8")) as { for_transfer_2026: FtRow[]; sold_2026_tab: SoldRow[]; file: string; taken: string };
const s = (v: unknown): string | null => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());

interface Flag { source: string; row: number; plate: string; issue: string }
interface Plan {
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
  type Unit = { plate_no: string; make: string | null; model_variant: string | null; year_model: string | null; color: string | null; fuel: string | null; trans: string | null; mileage: string | null; reg_owner_name: string | null; mo_file: string | null; stock_state: string | null; archived_at: string | null };
  const units = (await readAll<Unit>("docs_units", "plate_no, make, model_variant, year_model, color, fuel, trans, mileage, reg_owner_name, mo_file, stock_state, archived_at")).filter((u) => !u.archived_at);
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
    const plate = normPlate(r.E), src = "transfer tab";
    const pp = plateProblem(r.E);
    if (pp) { flag(src, r.row, String(r.E), `plate: ${pp}. The row is left out until a person fixes the plate.`); continue; }
    const u = unitOf.get(plate), near = u ? undefined : nearPlate(plate, s(r.C));
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
    plans.push({
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
    const plate = normPlate(r.PLATE), src = "SOLD 2026 tab";
    if (have.has(plate)) { skipped.push(plate); continue; }
    const u = unitOf.get(plate), near = u ? undefined : nearPlate(plate, r.MAKE);
    const pp = plateProblem(r.PLATE); if (pp) { flag(src, r.row, String(r.PLATE), `plate: ${pp}`); continue; }
    const d = parseSoldDate(r.DATE); if (d.problem) flag(src, r.row, plate, `sold date: ${d.problem}`);
    const sp = salesperson(r.SALES); if (sp.problem) flag(src, r.row, plate, sp.problem); else if (!sp.name) flag(src, r.row, plate, "no sales person");
    const ph = cleanPhone(r.CONTACT);
    const price = Number(r.PRICE); if (!Number.isFinite(price) || price <= 0) flag(src, r.row, plate, "no agreed price");
    const liaison = /^(JEP|LEO)$/i.test(r.LIAISON ?? "") ? r.LIAISON!.toUpperCase() : null;
    flag(src, r.row, plate, "the transfer status is not known (this tab is old): a person checks it");
    plans.push({
      source: src, row: r.row, plate, car: u ? "in MAD" : near ? "decide" : "new car", near,
      sale: { sold_on: d.date, price: Number.isFinite(price) && price > 0 ? price : null, buyer: s(r.BUYER), contact: ph.value, address: s(r.ADDRESS), salesperson: sp.name, route: /^MAD$/i.test(r.TRANSFER ?? "") ? "mad" : /^CLIENT$/i.test(r.TRANSFER ?? "") ? "client" : "unknown" },
      transfer: { stage: "unknown", liaison, liaison_status: null, received_on: null, originals: originalsAt(r.REMARKS), financing: financingOf(r.REMARKS), next_step: null, note: s(r.REMARKS), merges_existing: transferOf.has(plate) },
      fill: {}, fix: {},
    });
  }

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
  const fills = ft.flatMap((p) => Object.keys(p.fill)); const fixes = ft.flatMap((p) => Object.keys(p.fix));
  console.log(`\nWHAT IS FILLED INTO CARS MAD ALREADY HAS (only where MAD is empty): `, by(fills.map((f) => ({ f })), (x) => x.f));
  console.log(`WHAT IS FIXED (MAD is wrong and the sheet proves it): ${ft.filter((p) => p.fix.reg_owner_name).length} car(s) with the owner and the CR office swapped`);
  console.log(`\nNEW CARS TO CREATE as "Sold, not on the sale list": ${plans.filter((p) => p.car === "new car").length}`);
  console.log(`WAITING FOR A DECISION (plate almost like a MAD car):`);
  for (const p of plans.filter((x) => x.car === "decide")) { const u = unitOf.get(p.near!); const row = p.source === "transfer tab" ? snap.for_transfer_2026.find((x) => x.row === p.row) : null, old = p.source === "transfer tab" ? null : snap.sold_2026_tab.find((x) => x.row === p.row); console.log(`  ${p.plate} (${p.source}, row ${p.row}, buyer ${p.sale.buyer ?? "?"}${row ? `, ${row.B} ${row.C} ${row.D} ${row.I}` : old ? `, ${old.YEAR} ${old.MAKE} ${old.MODEL} ${old.COLOR}` : ""})  ~  MAD ${p.near}: ${[u?.year_model, u?.make, u?.model_variant, u?.color].filter(Boolean).join(" ")}, ${u?.stock_state}`); }
  console.log(`\nFLAGGED FOR A PERSON: ${flags.length} item(s)`, by(flags, (f) => f.issue.replace(/"[^"]*"/g, "").replace(/\d+/g, "#").slice(0, 60)));
  void fixMake;
  writeFileSync("Docs/sheets-private/sold-dryrun.json", JSON.stringify({ plans, flags, skipped }, null, 1));
  writeFileSync("Docs/sheets-private/sold-flags.csv", ["source,row,plate,issue", ...flags.map((f) => [f.source, f.row, f.plate, `"${f.issue.replace(/"/g, "'")}"`].join(","))].join("\n"));
  console.log("\nWrote Docs/sheets-private/sold-dryrun.json and sold-flags.csv. Nothing was written to the database.");
}
main().catch((e) => { console.error(e); process.exit(1); });
