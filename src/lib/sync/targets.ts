import { decide } from "@/lib/inventory/decide";
import { sheetDate } from "@/lib/inventory/remarks";
import type { InventoryAdapter } from "@/lib/inventory/types";
import { formatDate } from "@/lib/dates";
import { formatPeso } from "@/lib/rules/money";
import type { AppSettings } from "@/lib/deal/settings";
import { centsOf, dealStatusKey, type DealStatusKey } from "@/lib/deal/status";
import type { Tables } from "@/lib/supabase/database.types";
import type { TelegramClient } from "@/lib/telegram";

/** The shared sheet says something that disagrees with the app. Nothing is written; a person decides (the Sync jobs page offers the choices). */
export class SyncConflict extends Error {}

export type SyncTarget = "drive" | "sheets" | "telegram" | "inventory" | "docs";

/** Why a job runs: an AR was created ("submit"), a receipt was approved, a receipt was voided, a deal was cancelled or changed (loan released). */
export type SyncEvent = "submit" | "confirm" | "void" | "cancel" | "edit";

/** Drive runs first. ("sheets" is no longer written: old queued jobs of that kind just end.) */
export const TARGET_ORDER: SyncTarget[] = ["drive", "sheets", "telegram", "inventory", "docs"];

export interface ProofBytes { name: string; mime: string; bytes: Uint8Array }

export interface SyncContext {
  event: SyncEvent;
  /** For void: the voided receipt. For cancel and edit: the deal's latest approved receipt. */
  receipt: Tables<"receipts">;
  deal: Tables<"deal_summaries">;
  units: { make_type: string; plate: string; plate_no: string; color: string | null }[];
  payments: Tables<"receipt_payments">[];
  settings: AppSettings;
  filledInBy: string;
  /** Who opened the deal: written in the inventory sheet. */
  salesperson: string;
  lastReceiptNo: string;
  lastReceiptAt: string;
  today: string;
  proofs: () => Promise<ProofBytes[]>;
}

export interface SyncDeps {
  telegram: () => TelegramClient;
  inventory: InventoryAdapter;
  /** Finds the car's document folder by plate and links it to the deal. */
  docsLink?: (plate: string, dealId: string) => Promise<unknown>;
  /** Puts the audit copy of the receipt (its printout and proofs) in the receipts folder in Drive. */
  auditCopy?: (ctx: SyncContext) => Promise<void>;
}

export type SyncResult = void;

const plates = (ctx: SyncContext) => ctx.units.map((u) => u.plate).join(", ");
const makes = (ctx: SyncContext) => ctx.units.map((u) => u.make_type).join(" + ");

export function dealStatusOf(deal: Tables<"deal_summaries">, today: string): DealStatusKey {
  return dealStatusKey({ status: deal.status, balance: centsOf(deal.balance), due_date: deal.due_date, sale_type: deal.sale_type, loan_status: deal.loan_status }, today);
}

/** What the inventory sheet should say: Sold only when everything is settled, Reserved while open, Available when cancelled. */
export function unitStatusFor(status: DealStatusKey): "Available" | "Reserved" | "Sold" {
  return status === "settled" ? "Sold" : status === "cancelled" ? "Available" : "Reserved";
}

/** Each target is safe to run again: it checks for its own earlier result first. */
export const syncTargets: Record<SyncTarget, (ctx: SyncContext, deps: SyncDeps) => Promise<SyncResult | void>> = {
  async docs(ctx, deps) {
    // Only when the AR is created. Each plate of the deal gets its folder linked (or flagged when none or several match).
    if (ctx.event !== "submit") return;
    if (!deps.docsLink) throw new Error("The documents folders are not set up");
    for (const unit of ctx.units) await deps.docsLink(unit.plate, ctx.deal.id);
  },

  // The audit copy: every saved receipt goes to the receipts folder in Drive (its printout and its proofs), once. The copy into the car's own folder is a button.
  async drive(ctx, deps) {
    if (ctx.event !== "confirm") return;
    if (deps.auditCopy) await deps.auditCopy(ctx);
  },

  // Google Sheets are not written any more: old queued jobs for this target just end.
  async sheets() { return; },

  async telegram(ctx, deps) {
    if (ctx.event === "confirm") {
      const image = (await ctx.proofs()).find((p) => p.mime.startsWith("image/"));
      if (image) await deps.telegram().sendPhoto(image.bytes, telegramCaption(ctx));
      else await deps.telegram().sendMessage(telegramCaption(ctx));
    } else if (ctx.event === "void") await deps.telegram().sendMessage(voidMessage(ctx));
    else if (ctx.event === "cancel") await deps.telegram().sendMessage(cancelMessage(ctx));
    // Other changes (a loan released) are not announced.
  },

  async inventory(ctx, deps) {
    // The deal's current status, so a late or repeated job still writes the right word.
    const status = unitStatusFor(dealStatusOf(ctx.deal, ctx.today));
    const ref = { receiptNo: ctx.lastReceiptNo, people: [{ name: ctx.salesperson, percent: null }], date: sheetDate(ctx.lastReceiptAt) };
    for (const u of ctx.units) {
      // The sheet is shared with staff: look at what it says now before writing, and stop if it disagrees with this deal.
      const now = await deps.inventory.getUnit(u.plate_no);
      const d = decide(status, now ? (now.remarks ?? "") : null, ref, ctx.deal.deal_no);
      if (d.action === "conflict") throw new SyncConflict(`${u.plate}: ${d.why} ${d.fix}`);
      if (d.action === "same") continue;
      await deps.inventory.setStatus(u.plate_no, status, ref);
    }
  },
};

const saleText = (ctx: SyncContext) => (ctx.deal.sale_type === "financing" ? `Financing (${ctx.deal.institution})` : "Cash");

/** Sent when an admin voids a receipt. */
export function voidMessage(ctx: SyncContext): string {
  return [
    `⚠️ Receipt #${ctx.receipt.receipt_no} VOIDED`, ctx.deal.buyer_name, [makes(ctx), plates(ctx)].filter(Boolean).join(" · "),
    `Reason: ${ctx.receipt.void_reason ?? "—"}`, `Balance now ${formatPeso(centsOf(ctx.deal.balance))}`, `Unit: ${unitStatusFor(dealStatusOf(ctx.deal, ctx.today))}`,
  ].join("\n");
}

/** Sent when an admin cancels a deal. */
export function cancelMessage(ctx: SyncContext): string {
  return [
    "❌ Deal CANCELLED", ctx.deal.buyer_name, [makes(ctx), plates(ctx)].filter(Boolean).join(" · "), `Reason: ${ctx.deal.cancel_reason ?? "—"}`,
    `Refunded ${formatPeso(centsOf(ctx.deal.refund_amount))}`, "Unit: Available",
  ].join("\n");
}

/** Sent when a receipt is saved. */
export function telegramCaption(ctx: SyncContext): string {
  const { receipt, deal } = ctx, balance = centsOf(receipt.balance_after);
  const money = [`Paid ${formatPeso(centsOf(receipt.amount))}`, `Balance ${formatPeso(Math.max(0, balance))}`];
  if (balance > 0 && deal.due_date) money.push(`Due ${formatDate(deal.due_date)}`);
  return [
    `🧾 Receipt #${receipt.receipt_no} · ${receipt.kind.toUpperCase()}`, deal.buyer_name, [makes(ctx), plates(ctx)].filter(Boolean).join(" · "), money.join(" · "),
    saleText(ctx), `Filled in by ${ctx.filledInBy}`, `Unit: ${unitStatusFor(dealStatusOf(deal, ctx.today))}`,
  ].join("\n");
}
