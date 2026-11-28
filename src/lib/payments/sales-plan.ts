import { sameBuyer } from "../sales/match";
import type { SalePayment } from "./parse";

// From the payments of a monthly SALES MONITORING tab to the sale records of MAD. The sheet is the source: the buyer, the price, the date and the
// payment of a sale follow it; the transfer fields of the record (liaison, stage, originals...) are never touched. Pure.

export interface ExistingSale { id: string; plate: string; buyer: string | null; sourceKey: string | null; stage: string | null }
export type PayStatus = "unpaid" | "partial" | "paid" | "loan_released";

export interface SalePlan {
  plate: string; buyer: string; agreedPrice: number | null; soldOn: string | null; financing: string | null; paid: number; status: PayStatus;
  /** create: a new record; update: the record this sheet row made before, the one with the same buyer, or (the sheet wins) the one another buyer had; skip: nothing usable on the row */
  action: "create" | "update" | "skip"; saleId: string | null; sourceKey: string; reason?: string;
  payments: SalePayment[]; arMissing: number;
}

export const saleKey = (tab: string, plate: string) => `sheet|${tab}|${plate}`;

/** Paid in full when what came in covers the price; a financed sale stays "partly paid" until the lender's payout is there. */
export function statusOf(paid: number, agreed: number | null, financed: boolean, lenderPaid: boolean): PayStatus {
  if (paid <= 0) return "unpaid";
  if (agreed !== null && paid + 0.5 >= agreed) return financed && lenderPaid ? "loan_released" : "paid";
  return "partial";
}

export function planSales(pays: SalePayment[], existing: ExistingSale[]): SalePlan[] {
  const groups = new Map<string, SalePayment[]>();
  for (const p of pays) if (p.plate && p.amount > 0) groups.set(`${p.tab}\u0000${p.plate}`, [...(groups.get(`${p.tab}\u0000${p.plate}`) ?? []), p]);
  const plans: SalePlan[] = [];
  for (const list of groups.values()) {
    const first = list[0], plate = first.plate;
    const buyer = (list.find((p) => p.buyer)?.buyer ?? "").trim().toUpperCase();
    const agreed = list.map((p) => p.agreedPrice).find((v) => v !== null && v > 0) ?? null;
    const dates = list.map((p) => p.date).filter((d): d is string => !!d).sort();
    const paid = Math.round(list.reduce((n, p) => n + p.amount, 0) * 100) / 100;
    const financing = list.find((p) => p.stage === "financing")?.bank?.toUpperCase() || null;
    const key = saleKey(first.tab, plate);
    const mine = existing.filter((e) => e.plate === plate && e.stage !== "cancelled");
    // the sheet's spelling of a name often differs from the typed one (LIU / LILI), so a record that a hand-typed deal made for this plate is this sale too
    const known = mine.find((e) => e.sourceKey === key) ?? mine.find((e) => sameBuyer(e.buyer, buyer)) ?? mine.find((e) => !e.buyer) ?? mine.find((e) => e.sourceKey?.startsWith("deal|"));
    const plan: SalePlan = {
      plate, buyer, agreedPrice: agreed, soldOn: dates[0] ?? null, financing, paid, status: statusOf(paid, agreed, list.some((p) => p.saleType.toLowerCase().includes("financ")) || !!financing, list.some((p) => p.stage === "financing")),
      action: "create", saleId: null, sourceKey: key, payments: list, arMissing: list.filter((p) => p.stage !== "financing" && p.stage !== "split" && !p.arNo).length,
    };
    if (known && !buyer) { plans.push({ ...plan, action: "update", saleId: known.id, buyer: known.buyer ?? "" }); continue; } // no name on the sheet row: the record keeps its buyer
    if (!buyer) { plans.push({ ...plan, action: "skip", reason: "no buyer written on the sheet row" }); continue; }
    if (known) plans.push({ ...plan, action: "update", saleId: known.id });
    else if (mine.length) plans.push({ ...plan, action: "update", saleId: mine[0].id, reason: `the sheet has another buyer than the record had (${mine[0].buyer ?? "?"}): the sheet wins` });
    else plans.push(plan);
  }
  return plans;
}

const KEEP = new Set(["Sold", "Not for sale", "For repair", "Sell as is", "Shipped to Cebu"]);
/**
 * The car's status that follows its sale on the sheet: a sale paid in full makes the car Sold; money in but a balance left makes an Onhand car Reserved.
 * Never moves a car that is already Sold, not for sale, for repair, as-is or in Cebu, and never goes backwards. Null: leave the car as it is.
 */
export function carStateFor(current: string | null, status: PayStatus): "Sold" | "Reserved" | null {
  if (current && KEEP.has(current)) return null;
  if (status === "paid" || status === "loan_released") return "Sold";
  if (status === "partial" && (!current || current === "Onhand")) return "Reserved";
  return null;
}

/** A sale counts for the car's status only while it is recent: a car sold last spring may be on the lot again. */
export const isRecentSale = (lastPaid: string | null, today: string, days = 45): boolean => !!lastPaid && Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastPaid}T00:00:00Z`) <= days * 86_400_000;
