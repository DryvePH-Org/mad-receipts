import "server-only";
import { cleanDetails } from "@/lib/docs/details";
import { docsDb } from "@/lib/docsbible/review-server";
import type { DetailRow, PriceRow } from "./export";

/** The price list as the database holds it: the stock row (prices, location, notes) joined with the car's Docs Bible row and its About-the-car answers. */
export async function loadPriceList(): Promise<{ rows: PriceRow[]; details: DetailRow[] }> {
  const db = docsDb();
  const { data: stock, error } = await db.from("car_stock").select("*").eq("in_stock", true).order("sort_order").limit(3000);
  if (error) throw new Error(`Could not read the price list: ${error.message}`);
  const list = stock ?? [];
  const ids = list.map((s) => s.unit_id as string);
  const plates = list.map((s) => s.plate_no as string);
  const [units, complete, details] = await Promise.all([
    ids.length ? db.from("docs_units").select("id, plate_display, arrival_date, year_model, make, model_variant, color, mileage, trans, fuel, encumbrance, spare_key, classification").in("id", ids).limit(3000) : { data: [] },
    ids.length ? db.from("docs_complete").select("id, complete_docs").in("id", ids).limit(3000) : { data: [] },
    plates.length ? db.from("unit_details").select("plate_no, data").in("plate_no", plates).limit(3000) : { data: [] },
  ]);
  const unit = new Map((units.data ?? []).map((u) => [u.id as string, u]));
  const done = new Map((complete.data ?? []).map((c) => [c.id as string, c.complete_docs as string | null]));
  const about = new Map((details.data ?? []).map((d) => [d.plate_no as string, cleanDetails(d.data)]));

  const rows: PriceRow[] = [];
  const out: DetailRow[] = [];
  for (const s of list) {
    const u = unit.get(s.unit_id as string);
    if (!u) continue;
    const d = about.get(s.plate_no as string);
    // one spare key: the About-the-car answer when someone gave one, else what the Docs Bible row says
    const spareKey = d?.spareKey === "yes" ? "W/SPAREKEY" : d?.spareKey === "no" ? "NO SPAREKEY" : (u.spare_key as string | null);
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    rows.push({
      group: s.body_group as string | null, order: Number(s.sort_order), papersWith: s.papers_with as string | null, orExpiry: s.or_expiry as string | null, orExpiryRaw: s.or_expiry_raw as string | null,
      spareKey, arrived: u.arrival_date as string | null, ym: u.year_model as string | null, brand: u.make as string | null, make: u.model_variant as string | null, color: u.color as string | null,
      mileage: u.mileage as string | null, trans: u.trans as string | null, fuel: u.fuel as string | null, plate: (u.plate_display as string) || (s.plate_no as string),
      price: num(s.list_price), target: num(s.target_price), reprice: num(s.reprice), retarget: num(s.retarget), remarks: s.remarks as string | null,
      encumbrance: u.encumbrance as string | null, tools: s.tools as string | null, location: s.location as string | null, repairStatus: s.repair_status as string | null,
    });
    out.push({
      plate: (u.plate_display as string) || (s.plate_no as string), car: [u.year_model, u.make, u.model_variant, u.color].filter(Boolean).join(" "), classification: u.classification as string | null,
      papersComplete: done.get(s.unit_id as string) ?? null, spareKey, casaMaintained: d?.casaMaintained || null, casaWhen: d?.casaWhen || null, casaWhere: d?.casaWhere || null,
      batteryWhen: d?.batteryWhen || null, boughtFrom: d?.boughtFrom || null, isEv: !!d?.isEv, evCharger: d?.evCharger || null, evCard: d?.evCard || null, note: d?.note || null,
    });
  }
  return { rows, details: out };
}
