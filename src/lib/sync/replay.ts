import "server-only";
import { manilaToday } from "@/lib/dates";
import { decide, type Decision } from "@/lib/inventory/decide";
import { sheetDate } from "@/lib/inventory/remarks";
import type { InventoryAdapter, UnitStatus } from "@/lib/inventory/types";
import type { createAdminClient } from "@/lib/supabase/admin";
import { dealStatusOf, unitStatusFor } from "./targets";

// "Replay to the live sheets": after the app's connections are pointed at the real sheets, the transactions entered while it
// pointed at test copies can be sent over. The inventory sheet is shared with staff, so it is never overwritten blindly:
// each car is compared with what the live sheet says now, and anything that differs waits for a person to tick it.

type Admin = ReturnType<typeof createAdminClient>;

export type ReplayAction = Decision;

export interface ReplayCar {
  plate: string;
  display: string;
  makeType: string;
  dealNo: string;
  /** what the app says the unit's status should be */
  wants: UnitStatus;
  /** the live sheet's REMARKS cell as it is now */
  current: string;
  /** the cell after the change */
  next: string;
  action: ReplayAction;
  /** a few words saying why, for the person ticking */
  why: string;
  /** what to do about it (only when there is a conflict, or the plate is missing) */
  fix: string;
  /** who and when, as the sheet note is written */
  ref: { receiptNo: string; people: { name: string; percent: number | null }[]; date: string };
}

interface DealRow { id: string; deal_no: string; created_by: string | null; created_at: string }

/** For every plate, the status its newest deal asks for. Only deals that have an approved receipt count (that is when the sheet is written). */
export async function planReplay(admin: Admin, inv: InventoryAdapter): Promise<{ cars: ReplayCar[]; approvedReceipts: number }> {
  const today = manilaToday();
  const [{ data: deals }, { data: units }, { data: receipts }, { data: people }] = await Promise.all([
    admin.from("deal_summaries").select("*"),
    admin.from("deal_units").select("deal_id, make_type, plate_no, plate_display"),
    admin.from("receipts").select("id, deal_id, receipt_date, created_at").eq("status", "approved"),
    admin.from("profiles").select("id, full_name"),
  ]);
  const lastDate = new Map<string, string>(); // newest approved receipt date per deal
  for (const r of receipts ?? []) if (!lastDate.get(r.deal_id) || r.receipt_date > lastDate.get(r.deal_id)!) lastDate.set(r.deal_id, r.receipt_date);
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name ?? ""]));
  const newestDealOfPlate = new Map<string, { deal: DealRow & Record<string, unknown>; make: string; display: string }>();
  for (const u of units ?? []) {
    const deal = (deals ?? []).find((d) => d.id === u.deal_id);
    if (!deal || !lastDate.has(deal.id)) continue;
    const have = newestDealOfPlate.get(u.plate_no);
    if (!have || String(deal.created_at ?? "") > String(have.deal.created_at ?? "")) newestDealOfPlate.set(u.plate_no, { deal: deal as never, make: u.make_type, display: u.plate_display });
  }
  const cars: ReplayCar[] = [];
  for (const [plate, { deal, make, display }] of newestDealOfPlate) {
    const wants = unitStatusFor(dealStatusOf(deal as never, today));
    const ref = { receiptNo: "", people: [{ name: name.get(deal.created_by ?? "") ?? "", percent: null }], date: sheetDate(`${lastDate.get(deal.id)}T04:00:00Z`) };
    const current = await inv.getUnit(plate).then((u) => (u ? (u.remarks ?? "") : null));
    const c = decide(wants, current, ref, deal.deal_no);
    cars.push({ plate, display, makeType: make, dealNo: deal.deal_no, wants, current: current ?? "", next: c.next, action: c.action, why: c.why, fix: c.fix, ref });
  }
  const order = { conflict: 0, change: 1, missing: 2, same: 3 } as const;
  cars.sort((a, b) => order[a.action] - order[b.action] || a.display.localeCompare(b.display));
  return { cars, approvedReceipts: (receipts ?? []).length };
}

export interface ReplayRequest {
  /** plates (no spaces or dashes) of the cars whose inventory note should be written */
  plates: string[];
  /** add every approved receipt to the log sheet */
  logRows: boolean;
  /** file every approved receipt and its proofs in the Drive folder */
  drive: boolean;
}

/**
 * Sends the chosen things to the live sheets. The inventory is written only for the ticked cars, and only if the live sheet
 * still says what it said in the preview (a person may have changed it in between). Log rows and Drive files are queued as
 * ordinary sync jobs: they are matched by receipt number and file name, so running this twice adds nothing twice.
 */
export async function runReplay(admin: Admin, inv: InventoryAdapter, req: ReplayRequest): Promise<{ written: number; skipped: string[]; queued: number }> {
  const { cars } = await planReplay(admin, inv);
  const picked = new Set(req.plates);
  let written = 0;
  const skipped: string[] = [];
  for (const car of cars) {
    if (!picked.has(car.plate)) continue;
    if (car.action === "same" || car.action === "missing") { skipped.push(`${car.display}: ${car.why}`); continue; }
    await inv.setStatus(car.plate, car.wants, car.ref);
    written++;
  }
  let queued = 0;
  const targets = [...(req.logRows ? ["sheets"] : []), ...(req.drive ? ["drive"] : [])];
  if (targets.length) {
    const { data: receipts } = await admin.from("receipts").select("id").eq("status", "approved").order("created_at");
    const ids = (receipts ?? []).map((r) => r.id);
    // a receipt already filed in the old (test) folder must be filed again in the live one
    if (req.drive && ids.length) await admin.from("receipts").update({ drive_file_id: null }).in("id", ids);
    for (const id of ids) {
      const { error } = await admin.rpc("queue_sync", { p_receipt_id: id, p_event: "confirm", p_targets: targets });
      if (!error) queued += targets.length;
    }
  }
  return { written, skipped, queued };
}
