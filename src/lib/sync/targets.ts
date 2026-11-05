import { driveFileLink, type DriveClient } from "@/lib/google/drive";
import { tabRange, type CellValue, type SheetsClient } from "@/lib/google/sheets";
import { sheetDate } from "@/lib/inventory/remarks";
import type { InventoryAdapter } from "@/lib/inventory/types";
import { formatDate } from "@/lib/dates";
import { formatPeso, toCentavos } from "@/lib/rules/money";
import type { AppSettings } from "@/lib/deal/settings";
import type { FormState } from "@/lib/deal/types";
import { centsOf, dealStatusKey, STATUS_LABELS, type DealStatusKey } from "@/lib/deal/status";
import type { Tables } from "@/lib/supabase/database.types";
import type { TelegramClient } from "@/lib/telegram";
import { receiptRecordHtml } from "./receipt-record";

export type SyncTarget = "drive" | "sheets" | "telegram" | "inventory";

/** Why a job runs: a receipt was approved, a receipt was voided, a deal was cancelled or changed (loan released). */
export type SyncEvent = "confirm" | "void" | "cancel" | "edit";

/** Drive runs first so the Sheets row can carry the link. */
export const TARGET_ORDER: SyncTarget[] = ["drive", "sheets", "telegram", "inventory"];

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
  approvedBy: string;
  /** Who opened the deal: written in the inventory sheet. */
  salesperson: string;
  lastReceiptNo: string;
  lastReceiptAt: string;
  today: string;
  proofs: () => Promise<ProofBytes[]>;
}

export interface SyncDeps {
  sheets: () => SheetsClient;
  drive: () => DriveClient;
  telegram: () => TelegramClient;
  inventory: InventoryAdapter;
  config: { driveFolderId?: string; logSheetId?: string };
}

export interface SyncResult { driveFileId?: string }

export const RECEIPTS_TAB = "Receipts";
export const DEALS_TAB = "Deals";
export const RECEIPT_HEADERS = [
  "Timestamp", "Receipt No", "Date", "Buyer", "Contact", "Plate", "Make/Type", "Payment Type", "Paid Today", "Paid Through",
  "Agreed Price", "Amount Due", "Balance After", "Sale Type", "Institution", "Filled In By", "Approved By", "Drive Link", "Status",
];
export const DEAL_HEADERS = [
  "Deal No", "Buyer", "Plate", "Make/Type", "Agreed Price", "Sale Type", "Institution", "Loan", "Processing Fee (to lender)", "Trade-in",
  "Amount Due", "Received", "Balance", "Status", "Loan Status", "Last Receipt No",
];

const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const pesos = (value: number | string | null | undefined) => centsOf(value) / 100;
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
  async drive(ctx, deps) {
    if (ctx.event !== "confirm" || ctx.receipt.drive_file_id) return; // filed once
    const folderId = required(deps.config.driveFolderId, "GOOGLE_DRIVE_FOLDER_ID");
    const drive = deps.drive();
    const base = `${ctx.receipt.receipt_no}_${ctx.units[0]?.plate_no ?? "deal"}`;
    const html = new TextEncoder().encode(receiptRecordHtml(ctx.receipt.snapshot as unknown as FormState, ctx.settings.company));
    const fileId = (await drive.findFile(folderId, `${base}.html`)) ?? (await drive.uploadFile(folderId, `${base}.html`, html, "text/html"));
    let n = 0;
    for (const p of await ctx.proofs()) {
      const name = `${base}_proof-${++n}.${p.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg"}`;
      if (!(await drive.findFile(folderId, name))) await drive.uploadFile(folderId, name, p.bytes, p.mime);
    }
    return { driveFileId: fileId };
  },

  async sheets(ctx, deps) {
    const sheetId = required(deps.config.logSheetId, "GOOGLE_SHEET_ID");
    const sheets = deps.sheets();
    // Receipts are appended once when approved, and their row is updated when voided. Cancelling or
    // changing a deal only changes the deal's row.
    if (ctx.event === "confirm" || ctx.event === "void") {
      await upsertRow(sheets, sheetId, RECEIPTS_TAB, RECEIPT_HEADERS, 1, ctx.receipt.receipt_no, receiptRow(ctx), { updateExisting: ctx.event === "void" });
    }
    await upsertRow(sheets, sheetId, DEALS_TAB, DEAL_HEADERS, 0, ctx.deal.deal_no, dealRow(ctx), { updateExisting: true });
  },

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
    for (const u of ctx.units) {
      await deps.inventory.setStatus(u.plate_no, status, { receiptNo: ctx.lastReceiptNo, people: [{ name: ctx.salesperson, percent: null }], date: sheetDate(ctx.lastReceiptAt) });
    }
  },
};

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function upsertRow(sheets: SheetsClient, sheetId: string, tab: string, headers: string[], keyColumn: number, key: string, row: CellValue[], { updateExisting }: { updateExisting: boolean }) {
  let rows: string[][];
  try {
    rows = await sheets.getValues(sheetId, tabRange(tab));
  } catch (err) {
    if (Number((err as { code?: unknown }).code) === 400) throw new Error(`Tab "${tab}" was not found in the receipts log sheet`);
    throw err;
  }
  // Write the header row when the tab is empty, or add the names of newer columns to an older header row.
  if (rows.length === 0 || rows[0].length < headers.length) await sheets.updateValues(sheetId, tabRange(tab, "A1"), [headers]);
  const index = rows.findIndex((r, i) => i > 0 && r[keyColumn] === key);
  if (index === -1) await sheets.appendValues(sheetId, tabRange(tab), [row]);
  else if (updateExisting) await sheets.updateValues(sheetId, tabRange(tab, `A${index + 1}`), [row]);
}

/** "2026-11-02 15:30" in Manila time. */
function manilaTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

const saleText = (ctx: SyncContext) => (ctx.deal.sale_type === "financing" ? `Financing (${ctx.deal.institution})` : "Cash");

export function receiptRow(ctx: SyncContext): CellValue[] {
  const { receipt, deal } = ctx;
  return [
    manilaTimestamp(receipt.created_at), receipt.receipt_no, receipt.receipt_date, deal.buyer_name, deal.buyer_contact ?? "", plates(ctx), makes(ctx),
    label(receipt.kind), pesos(receipt.amount), ctx.payments.map((p) => `${p.label} ${formatPeso(centsOf(p.amount))}`).join(", "),
    pesos(deal.agreed_price), pesos(deal.amount_due), pesos(receipt.balance_after), deal.sale_type === "financing" ? "Financing" : "Cash", deal.institution ?? "",
    ctx.filledInBy, ctx.approvedBy, receipt.drive_file_id ? driveFileLink(receipt.drive_file_id) : "", label(receipt.status),
  ];
}

export function dealRow(ctx: SyncContext): CellValue[] {
  const { deal } = ctx;
  return [
    deal.deal_no, deal.buyer_name, plates(ctx), makes(ctx), pesos(deal.agreed_price), deal.sale_type === "financing" ? "Financing" : "Cash", deal.institution ?? "",
    pesos(deal.loan_amount), pesos(deal.processing_fee), pesos(deal.trade_in_value), pesos(deal.amount_due),
    (toCentavos(deal.approved_paid) ?? 0) / 100 + pesos(deal.opening_paid), pesos(deal.balance), STATUS_LABELS[dealStatusOf(deal, ctx.today)], label(deal.loan_status), ctx.lastReceiptNo,
  ];
}

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

/** Sent when the Approver approves a receipt. */
export function telegramCaption(ctx: SyncContext): string {
  const { receipt, deal } = ctx, balance = centsOf(receipt.balance_after);
  const money = [`Paid ${formatPeso(centsOf(receipt.amount))}`, `Balance ${formatPeso(Math.max(0, balance))}`];
  if (balance > 0 && deal.due_date) money.push(`Due ${formatDate(deal.due_date)}`);
  return [
    `🧾 Receipt #${receipt.receipt_no} · ${receipt.kind.toUpperCase()}`, deal.buyer_name, [makes(ctx), plates(ctx)].filter(Boolean).join(" · "), money.join(" · "),
    saleText(ctx), `Approved by ${ctx.approvedBy}`, `Unit: ${unitStatusFor(dealStatusOf(deal, ctx.today))}`,
  ].join("\n");
}
