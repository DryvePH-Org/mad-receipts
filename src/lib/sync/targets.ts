import { driveFileLink, type DriveClient } from "@/lib/google/drive";
import { tabRange, type CellValue, type SheetsClient } from "@/lib/google/sheets";
import { formatDate } from "@/lib/dates";
import { sheetDate } from "@/lib/inventory/remarks";
import type { InventoryAdapter } from "@/lib/inventory/types";
import { formatPeso, toCentavos } from "@/lib/rules/money";
import { dealStatusForBalance, unitStatusForDeal, type DealStatus } from "@/lib/rules/payment";
import type { Tables } from "@/lib/supabase/database.types";
import type { TelegramClient } from "@/lib/telegram";

export type SyncTarget = "drive" | "sheets" | "telegram" | "inventory";

/** Why a job runs: a receipt was confirmed, a receipt was voided, a deal was cancelled or edited. */
export type SyncEvent = "confirm" | "void" | "cancel" | "edit";

/** Drive runs first so the Sheets row can carry the photo link. */
export const TARGET_ORDER: SyncTarget[] = ["drive", "sheets", "telegram", "inventory"];

export interface SyncContext {
  event: SyncEvent;
  /** For void: the voided receipt. For cancel and edit: the deal's latest confirmed receipt. */
  receipt: Tables<"receipts">;
  deal: Tables<"deals">;
  confirmedBy: string;
  /** Who opened the deal: used in the inventory sheet when no salesperson has been recorded yet. */
  salesperson: string;
  /** Who is credited with the deal, with each person's own commission percent. */
  salespeople: { name: string; percent: number }[];
  /** Latest confirmed receipt number on the deal, and when it was saved. */
  lastReceiptNo: string;
  lastReceiptAt: string;
  photo: () => Promise<Uint8Array>;
}

export interface SyncDeps {
  sheets: () => SheetsClient;
  drive: () => DriveClient;
  telegram: () => TelegramClient;
  inventory: InventoryAdapter;
  config: { driveFolderId?: string; logSheetId?: string };
}

export interface SyncResult {
  driveFileId?: string;
}

export const RECEIPTS_TAB = "Receipts";
export const DEALS_TAB = "Deals";
export const RECEIPT_HEADERS = [
  "Timestamp", "Receipt No", "Date", "Buyer", "Address", "Contact", "Plate", "Make/Type", "Color",
  "Motor", "Chassis", "Payment Type", "Amount", "Agreed Price", "Total Paid", "Balance", "Method",
  "Check No", "Bank/Branch", "Balance Due Date", "Photo Link", "Confirmed By", "Status",
];
export const DEAL_HEADERS = [
  "Deal ID", "Plate", "Buyer", "Agreed Price", "Total Paid", "Balance", "Status", "Last Receipt No", "Salespeople",
];

/** Each target is safe to run again: it checks for its own earlier result first. */
export const syncTargets: Record<SyncTarget, (ctx: SyncContext, deps: SyncDeps) => Promise<SyncResult | void>> = {
  async drive(ctx, deps) {
    if (ctx.event !== "confirm" || ctx.receipt.drive_file_id) return; // the photo is uploaded once
    const folderId = required(deps.config.driveFolderId, "GOOGLE_DRIVE_FOLDER_ID");
    const name = `${ctx.receipt.receipt_no}_${ctx.deal.plate_no}.jpg`;
    const drive = deps.drive();
    const fileId =
      (await drive.findFile(folderId, name)) ??
      (await drive.uploadFile(folderId, name, await ctx.photo(), "image/jpeg"));
    return { driveFileId: fileId };
  },

  async sheets(ctx, deps) {
    const sheetId = required(deps.config.logSheetId, "GOOGLE_SHEET_ID");
    const sheets = deps.sheets();
    // Receipts are appended once when confirmed, and their row is updated when voided.
    // Cancelling or editing a deal only changes the deal's row.
    if (ctx.event === "confirm" || ctx.event === "void") {
      await upsertRow(sheets, sheetId, RECEIPTS_TAB, RECEIPT_HEADERS, 1, ctx.receipt.receipt_no, receiptRow(ctx), {
        updateExisting: ctx.event === "void",
      });
    }
    await upsertRow(sheets, sheetId, DEALS_TAB, DEAL_HEADERS, 0, ctx.deal.id, dealRow(ctx), {
      updateExisting: true,
    });
  },

  async telegram(ctx, deps) {
    if (ctx.event === "confirm") await deps.telegram().sendPhoto(await ctx.photo(), telegramCaption(ctx));
    else if (ctx.event === "void") await deps.telegram().sendMessage(voidMessage(ctx));
    else if (ctx.event === "cancel") await deps.telegram().sendMessage(cancelMessage(ctx));
    // Edits are not announced.
  },

  async inventory(ctx, deps) {
    // The deal's current status, so a late or repeated job still writes the right word.
    const status = unitStatusForDeal(ctx.deal.status as DealStatus);
    const people = ctx.salespeople.length > 0
      ? ctx.salespeople
      : [{ name: ctx.salesperson, percent: null }]; // nobody recorded yet: the staff who opened the deal
    await deps.inventory.setStatus(ctx.deal.plate_no, status, {
      receiptNo: ctx.lastReceiptNo,
      people,
      date: sheetDate(ctx.lastReceiptAt),
    });
  },
};

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function upsertRow(
  sheets: SheetsClient,
  sheetId: string,
  tab: string,
  headers: string[],
  keyColumn: number,
  key: string,
  row: CellValue[],
  { updateExisting }: { updateExisting: boolean },
) {
  let rows: string[][];
  try {
    rows = await sheets.getValues(sheetId, tabRange(tab));
  } catch (err) {
    if (Number((err as { code?: unknown }).code) === 400) {
      throw new Error(`Tab "${tab}" was not found in the receipts log sheet`);
    }
    throw err;
  }
  if (rows.length === 0) {
    await sheets.updateValues(sheetId, tabRange(tab, "A1"), [headers]);
  }
  const index = rows.findIndex((r, i) => i > 0 && r[keyColumn] === key);
  if (index === -1) {
    await sheets.appendValues(sheetId, tabRange(tab), [row]);
  } else if (updateExisting) {
    await sheets.updateValues(sheetId, tabRange(tab, `A${index + 1}`), [row]);
  }
}

const pesos = (value: number) => (toCentavos(value) ?? 0) / 100;
const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "2026-11-02 15:30" in Manila time. */
function manilaTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function receiptRow({ receipt, deal, confirmedBy }: SyncContext): CellValue[] {
  const agreed = toCentavos(deal.agreed_price) ?? 0;
  const balance = toCentavos(receipt.balance_after) ?? 0;
  return [
    manilaTimestamp(receipt.created_at),
    receipt.receipt_no,
    receipt.receipt_date ?? "",
    deal.buyer_name,
    deal.buyer_address ?? "",
    deal.buyer_contact ?? "",
    deal.plate_no,
    deal.make_type ?? "",
    deal.color ?? "",
    deal.motor_no ?? "",
    deal.chassis_no ?? "",
    label(receipt.payment_type),
    pesos(receipt.amount),
    pesos(deal.agreed_price),
    (agreed - balance) / 100, // total paid as of this receipt
    pesos(receipt.balance_after),
    receipt.payment_method ? label(receipt.payment_method) : "",
    receipt.check_no ?? "",
    receipt.bank_branch ?? "",
    receipt.balance_due_date ?? "",
    receipt.drive_file_id ? driveFileLink(receipt.drive_file_id) : "",
    confirmedBy,
    label(receipt.status),
  ];
}

/** "David 3%, Ella 1.5%" for the log sheet. */
const salespeopleText = (people: { name: string; percent: number }[]) =>
  people.map((p) => `${p.name} ${Number(p.percent.toFixed(2))}%`).join(", ");

export function dealRow({ deal, lastReceiptNo, salespeople }: SyncContext): CellValue[] {
  return [
    deal.id,
    deal.plate_no,
    deal.buyer_name,
    pesos(deal.agreed_price),
    pesos(deal.total_paid),
    pesos(deal.balance),
    label(deal.status),
    lastReceiptNo,
    salespeopleText(salespeople),
  ];
}

/** Sent when an admin voids a receipt. */
export function voidMessage({ receipt, deal }: SyncContext): string {
  return [
    `⚠️ Receipt #${receipt.receipt_no} VOIDED`,
    deal.buyer_name,
    [deal.make_type, deal.plate_no].filter(Boolean).join(" · "),
    `Reason: ${receipt.void_reason ?? "—"}`,
    `Paid ${formatPeso(toCentavos(deal.total_paid) ?? 0)} · Balance ${formatPeso(toCentavos(deal.balance) ?? 0)}`,
    `Unit: ${unitStatusForDeal(deal.status as DealStatus)}`,
  ].join("\n");
}

/** Sent when an admin cancels a deal. */
export function cancelMessage({ deal }: SyncContext): string {
  const paid = formatPeso(toCentavos(deal.total_paid) ?? 0);
  return [
    "❌ Deal CANCELLED",
    deal.buyer_name,
    [deal.make_type, deal.plate_no].filter(Boolean).join(" · "),
    `Reason: ${deal.cancel_reason ?? "—"}`,
    deal.forfeited ? `Forfeited ${paid}` : `Paid ${paid} (not forfeited)`,
    `Unit: ${unitStatusForDeal(deal.status as DealStatus)}`,
  ].join("\n");
}

export function telegramCaption({ receipt, deal }: SyncContext): string {
  const balance = toCentavos(receipt.balance_after) ?? 0;
  const amount = toCentavos(receipt.amount) ?? 0;
  const money = [`Paid ${formatPeso(amount)}`, `Balance ${formatPeso(balance)}`];
  if (balance > 0 && receipt.balance_due_date) money.push(`Due ${formatDate(receipt.balance_due_date)}`);
  return [
    `🧾 Receipt #${receipt.receipt_no} · ${receipt.payment_type.toUpperCase()}`,
    deal.buyer_name,
    [deal.make_type, deal.plate_no].filter(Boolean).join(" · "),
    money.join(" · "),
    `Unit: ${unitStatusForDeal(dealStatusForBalance(balance))}`,
  ].join("\n");
}
