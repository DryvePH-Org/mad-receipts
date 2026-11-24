import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SyncContext } from "@/lib/sync/targets";
import { dealSaleKey, salespersonOf, sameBuyer } from "./match";

const db = (): SupabaseClient => createAdminClient() as unknown as SupabaseClient; // the sale records are newer than the generated types

/**
 * The first receipt of a deal makes the sale of each of its cars a record of the sale list, so there is one record per sale however it was made.
 * A record that is already there for the plate (from the sold list, or added by hand), with the same buyer and no deal yet, is joined to the deal
 * and only has its empty fields filled; otherwise a new record is made. Safe to run again.
 */
export async function ensureSaleRecords(ctx: SyncContext): Promise<void> {
  const client = db();
  const deal = ctx.deal;
  const { data: dealUnits } = await client.from("deal_units").select("plate_no, motor_no, chassis_no, make_type").eq("deal_id", deal.id);
  for (const du of (dealUnits ?? []) as { plate_no: string; motor_no: string | null; chassis_no: string | null; make_type: string }[]) {
    const plate = du.plate_no;
    const key = dealSaleKey(deal.id, plate);
    const { data: made } = await client.from("car_sales").select("id").eq("deal_id", deal.id).eq("plate_no", plate).limit(1); // made before, or an older record joined before
    if (made?.length) continue;
    const { data: unit } = await client.from("docs_units").select("id, year_model, make, model_variant, color, chassis_no, engine_no").eq("plate_no", plate).is("archived_at", null).order("arrival_date", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    const { data: there } = await client.from("car_sales").select("id, buyer, agreed_price, sold_on, sales, financing, address, contact, unit_id").eq("plate_no", plate).is("deal_id", null).neq("stage", "cancelled").order("created_at", { ascending: false });
    const match = ((there ?? []) as { id: string; buyer: string | null; agreed_price: number | null; sold_on: string | null; sales: string | null; financing: string | null; address: string | null; contact: string | null; unit_id: string | null }[]).find((t) => sameBuyer(t.buyer, deal.buyer_name));
    const seller = salespersonOf(ctx.salesperson), financing = deal.sale_type === "financing" ? deal.institution?.toUpperCase() ?? null : null;
    if (match) {
      const patch: Record<string, unknown> = { deal_id: deal.id };
      if (!match.unit_id && unit) patch.unit_id = unit.id;
      if (match.agreed_price === null) patch.agreed_price = deal.agreed_price;
      if (!match.sold_on) patch.sold_on = ctx.receipt.receipt_date;
      if (!match.sales && seller) patch.sales = seller;
      if (!match.financing && financing) patch.financing = financing;
      if (!match.address && deal.buyer_address) patch.address = deal.buyer_address.toUpperCase();
      if (!match.contact && deal.buyer_contact) patch.contact = deal.buyer_contact;
      const r = await client.from("car_sales").update(patch).eq("id", match.id);
      if (r.error) throw new Error(`The sale record of ${plate} could not be joined to the deal: ${r.error.message}`);
    } else {
      const car = unit ? [unit.year_model, unit.make, unit.model_variant, unit.color].filter(Boolean).join(" ") : du.make_type;
      const r = await client.from("car_sales").insert({
        plate_no: plate, unit_id: unit?.id ?? null, car_text: car || null, buyer: deal.buyer_name.toUpperCase(), address: deal.buyer_address?.toUpperCase() ?? null, contact: deal.buyer_contact,
        agreed_price: deal.agreed_price, sold_on: ctx.receipt.receipt_date, sales: seller, financing, route: "unknown", stage: "in_process", deal_id: deal.id,
        chassis_no: du.chassis_no, engine_no: du.motor_no, source: "app", source_key: key, created_by: deal.created_by, updated_by: deal.created_by,
      });
      if (r.error) throw new Error(`The sale record of ${plate} could not be made: ${r.error.message}`);
    }
    // the car record keeps the chassis and engine the receipt gave, when it has none
    if (unit) {
      const fill: Record<string, string> = {};
      if (!unit.chassis_no && du.chassis_no) fill.chassis_no = du.chassis_no;
      if (!unit.engine_no && du.motor_no) fill.engine_no = du.motor_no;
      if (Object.keys(fill).length) await client.from("docs_units").update({ ...fill, last_change_source: "app" }).eq("id", unit.id);
    }
  }
}

/** The deal was cancelled: its sale records are cancelled too (they stay on record, out of the open work). */
export async function cancelSaleRecords(dealId: string): Promise<void> {
  await db().from("car_sales").update({ stage: "cancelled", updated_at: new Date().toISOString() }).eq("deal_id", dealId);
}
