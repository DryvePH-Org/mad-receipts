import { describe, expect, it, vi } from "vitest";
import { emptyForm } from "@/app/(app)/new/form-state";
import { DEFAULT_SETTINGS, parseSettings } from "@/lib/deal/settings";
import type { DriveClient } from "@/lib/google/drive";
import { createMockInventory } from "@/lib/inventory/mock";
import { DEAL_HEADERS, RECEIPT_HEADERS, SyncConflict, cancelMessage, headerProblem, logSheetProblem, syncTargets, telegramCaption, unitStatusFor, voidMessage, type SyncContext, type SyncDeps } from "@/lib/sync/targets";
import type { TelegramClient } from "@/lib/telegram";
import { fakeSheets } from "./fakes";

const settings = parseSettings(DEFAULT_SETTINGS);
const IMAGE = { name: "cash.jpg", mime: "image/jpeg", bytes: new Uint8Array([0xff, 0xd8, 0xff]) };

function context(over: { receipt?: Partial<SyncContext["receipt"]>; deal?: Partial<SyncContext["deal"]>; event?: SyncContext["event"]; proofs?: SyncContext["proofs"] } = {}): SyncContext {
  const snapshot = { ...emptyForm(settings, "2026-11-04"), receiptNo: "2556", receivedFrom: "Maria Santos" };
  return {
    event: over.event ?? "confirm",
    receipt: { id: "r1", deal_id: "d1", receipt_no: "2556", receipt_date: "2026-11-04", kind: "partial", amount: 40000, payout: 0, balance_after: 680000, status: "approved", submitted_by: "u1", submitted_at: "2026-11-04T01:00:00Z", reviewed_by: "u2", reviewed_at: "2026-11-04T02:00:00Z", reject_reason: null, void_reason: null, voided_by: null, voided_at: null, remarks: null, notes: null, snapshot: snapshot as never, drive_file_id: null, created_at: "2026-11-04T01:00:00Z", ...over.receipt },
    deal: {
      id: "d1", deal_no: "D1001", buyer_name: "Maria Santos", buyer_address: "Pasig", buyer_contact: "09171234567", sale_type: "cash", institution: null, agreed_price: 720000, down_payment: null, amount_due: 720000, loan_amount: 0,
      processing_fee: 0, monthly_payment: null, years: null, opening_paid: 0, trade_in_value: 0, trade_in: null, lieu_amount: 0, lieu_until: null, due_date: "2026-12-15", due_text: null, loan_status: "none", loan_since: null,
      loan_released_on: null, status: "open", cancelled_at: null, cancel_reason: null, refund_amount: null, created_by: "u1", created_at: "2026-11-04T01:00:00Z", terms: {}, created_by_name: "David",
      approved_paid: 40000, approved_payout: 0, approved_count: 1, pending_paid: 0, pending_count: 0, balance: 680000, units: [], receipt_nos: "2556", ...over.deal,
    },
    units: [{ make_type: "2023 Toyota Vios", plate: "NBC 4821", plate_no: "NBC4821", color: "Silver" }],
    payments: [{ id: "p1", receipt_id: "r1", position: 1, method: "cash", label: "Cash", amount: 40000, reference: null, check_no: null, bank: null, branch: null }],
    settings, filledInBy: "David", approvedBy: "Karl", salesperson: "David", lastReceiptNo: "2556", lastReceiptAt: "2026-11-04T01:00:00Z", today: "2026-11-04",
    proofs: over.proofs ?? (async () => [IMAGE]),
  };
}

function deps() {
  const files = new Map<string, Uint8Array>(), uploads: string[] = [];
  const drive: DriveClient = {
    findFile: async (_f, name) => (files.has(name) ? `id-${name}` : null),
    uploadFile: async (_f, name, bytes) => { files.set(name, bytes); uploads.push(name); return `id-${name}`; },
  };
  const telegram: TelegramClient = { sendPhoto: vi.fn(async () => undefined), sendMessage: vi.fn(async () => undefined) };
  const sheets = fakeSheets({ Receipts: [], Deals: [] });
  const inventory = createMockInventory([{ plate: "NBC4821", status: "Available" }]);
  const d: SyncDeps = { sheets: () => sheets.client, drive: () => drive, telegram: () => telegram, inventory, config: { driveFolderId: "folder", logSheetId: "sheet" } };
  return { d, uploads, telegram, sheets, inventory };
}

describe("drive", () => {
  it("files the receipt copy and every proof once", async () => {
    const { d, uploads } = deps();
    const result = await syncTargets.drive(context(), d);
    expect(result).toEqual({ driveFileId: "id-2556_NBC4821.html" });
    expect(uploads).toEqual(["2556_NBC4821.html", "2556_NBC4821_proof-1.jpg"]);
    await syncTargets.drive(context(), d); // run again: nothing is uploaded twice
    expect(uploads).toHaveLength(2);
  });
  it("does nothing when already filed, or for other events", async () => {
    const { d, uploads } = deps();
    await syncTargets.drive(context({ receipt: { drive_file_id: "x" } }), d);
    await syncTargets.drive(context({ event: "void" }), d);
    expect(uploads).toEqual([]);
  });
});

describe("sheets", () => {
  it("adds the receipt and the deal on approval, and never twice", async () => {
    const { d, sheets } = deps();
    await syncTargets.sheets(context(), d);
    await syncTargets.sheets(context(), d);
    const receipts = sheets.tabs.Receipts, deals = sheets.tabs.Deals;
    expect(receipts[0]).toEqual(RECEIPT_HEADERS);
    expect(receipts).toHaveLength(2);
    expect(receipts[1].slice(1, 4)).toEqual(["2556", "2026-11-04", "Maria Santos"]);
    expect(receipts[1][8]).toBe(40000); // paid today
    expect(deals[0]).toEqual(DEAL_HEADERS);
    expect(deals).toHaveLength(2);
    expect(deals[1].slice(0, 3)).toEqual(["D1001", "Maria Santos", "NBC 4821"]);
  });
  it("marks the receipt voided and updates the deal's balance", async () => {
    const { d, sheets } = deps();
    await syncTargets.sheets(context(), d);
    await syncTargets.sheets(context({ event: "void", receipt: { status: "void" }, deal: { balance: 720000, approved_paid: 0 } }), d);
    expect(sheets.tabs.Receipts[1][18]).toBe("Void");
    expect(sheets.tabs.Deals[1][12]).toBe(720000);
  });
});

describe("telegram", () => {
  it("sends the first proof photo with the caption, or just the message", async () => {
    const a = deps();
    await syncTargets.telegram(context(), a.d);
    expect(a.telegram.sendPhoto).toHaveBeenCalledOnce();
    const caption = vi.mocked(a.telegram.sendPhoto).mock.calls[0][1];
    expect(caption).toContain("Receipt #2556 · PARTIAL");
    expect(caption).toContain("Approved by Karl");
    expect(caption).toContain("Unit: Reserved");
    const b = deps();
    await syncTargets.telegram(context({ proofs: async () => [] }), b.d);
    expect(b.telegram.sendMessage).toHaveBeenCalledOnce();
  });
  it("announces a void and a cancellation, but not a change", async () => {
    const a = deps();
    await syncTargets.telegram(context({ event: "void", receipt: { status: "void", void_reason: "Wrong amount" } }), a.d);
    await syncTargets.telegram(context({ event: "cancel", deal: { status: "cancelled", cancel_reason: "Changed his mind", refund_amount: 5000 } }), a.d);
    await syncTargets.telegram(context({ event: "edit" }), a.d);
    expect(a.telegram.sendMessage).toHaveBeenCalledTimes(2);
    expect(voidMessage(context({ receipt: { void_reason: "Wrong amount" } }))).toContain("Wrong amount");
    expect(cancelMessage(context({ deal: { cancel_reason: "Changed his mind", refund_amount: 5000 } }))).toContain("Refunded ₱5,000");
  });
});

describe("inventory", () => {
  it("Reserved while open, Sold when settled, Available when cancelled", async () => {
    const { d, inventory } = deps();
    await syncTargets.inventory(context(), d);
    await syncTargets.inventory(context({ deal: { balance: 0 } }), d);
    await syncTargets.inventory(context({ deal: { balance: 0, sale_type: "financing", institution: "BDO", loan_status: "waiting" } }), d);
    await syncTargets.inventory(context({ deal: { balance: 0, sale_type: "financing", institution: "BDO", loan_status: "released" } }), d);
    expect(inventory.changes.map((c) => c.status)).toEqual(["Reserved", "Sold", "Reserved", "Sold"]);
    expect(inventory.changes[0]).toMatchObject({ plate: "NBC4821", ref: { receiptNo: "2556", people: [{ name: "David", percent: null }] } });
  });
  it("a cancelled deal clears the salesperson's own note (and has nothing to do when there is none)", async () => {
    const { d } = deps();
    const withNote = createMockInventory([{ plate: "NBC4821", status: "Reserved", remarks: "RESERVED - DAVID 11/3" }]);
    await syncTargets.inventory(context({ deal: { status: "cancelled" } }), { ...d, inventory: withNote });
    expect(withNote.changes.map((c) => c.status)).toEqual(["Available"]);
    const empty = createMockInventory([{ plate: "NBC4821", status: "Available" }]);
    await syncTargets.inventory(context({ deal: { status: "cancelled" } }), { ...d, inventory: empty });
    expect(empty.changes).toEqual([]);
  });
  it("maps statuses", () => {
    expect([unitStatusFor("settled"), unitStatusFor("lender"), unitStatusFor("overdue"), unitStatusFor("cancelled")]).toEqual(["Sold", "Reserved", "Reserved", "Available"]);
  });
  it("the caption never promises Sold before it is settled", () => {
    expect(telegramCaption(context({ deal: { balance: 0, sale_type: "financing", institution: "BDO", loan_status: "waiting" } }))).toContain("Unit: Reserved");
  });
});

describe("conflicts with the shared sheets: nothing is written, and the person is told what to do", () => {
  it("the inventory note of someone else is never overwritten", async () => {
    const { d } = deps();
    const inventory = createMockInventory([{ plate: "NBC4821", status: "Reserved", remarks: "RESERVED - ELLA 10/30" }]);
    const err = await syncTargets.inventory(context(), { ...d, inventory }).catch((e) => e);
    expect(err).toBeInstanceOf(SyncConflict);
    expect(String(err.message)).toContain("RESERVED - ELLA 10/30"); // what the sheet says
    expect(String(err.message)).toContain("Ask ELLA and DAVID"); // and what to do
    expect(inventory.changes).toEqual([]);
  });
  it("the salesperson's own reservation becomes a sale without a fuss", async () => {
    const { d } = deps();
    const inventory = createMockInventory([{ plate: "NBC4821", status: "Reserved", remarks: "RESERVED - DAVID 11/3" }]);
    await syncTargets.inventory(context({ deal: { balance: 0 } }), { ...d, inventory });
    expect(inventory.changes.map((c) => c.status)).toEqual(["Sold"]);
  });
  it("a note that already says it is left alone", async () => {
    const { d } = deps();
    const inventory = createMockInventory([{ plate: "NBC4821", status: "Reserved", remarks: "RESERVED - DAVID 11/4" }]);
    await syncTargets.inventory(context(), { ...d, inventory });
    expect(inventory.changes).toEqual([]);
  });
  it("a log sheet whose first row is something else is not written to", async () => {
    const sheets = fakeSheets({ Receipts: [["Date", "Amount", "Notes"], ["x", "1", "y"]], Deals: [] });
    const { d } = deps();
    const err = await syncTargets.sheets(context(), { ...d, sheets: () => sheets.client }).catch((e) => e);
    expect(err).toBeInstanceOf(SyncConflict);
    expect(String(err.message)).toContain("not the app's headers");
    expect(sheets.calls.filter((c) => c.op !== "get")).toEqual([]);
  });
  it("an empty tab, or the app's own headers, is fine; the preview check says the same", async () => {
    expect(headerProblem("Receipts", undefined, RECEIPT_HEADERS)).toBeNull();
    expect(headerProblem("Receipts", RECEIPT_HEADERS.slice(0, 5), RECEIPT_HEADERS)).toBeNull(); // an older, shorter header row
    expect(await logSheetProblem(fakeSheets({ Receipts: [], Deals: [] }).client, "sheet")).toBeNull();
    expect(await logSheetProblem(fakeSheets({ Receipts: [["Foo"]], Deals: [] }).client, "sheet")).toContain("not the app's headers");
    expect(await logSheetProblem(fakeSheets({ Receipts: [] }).client, "sheet")).toContain('no "Deals" tab');
  });
});

describe("the receipt record filed in Drive", () => {
  it("lists the receipt and the money line by line", async () => {
    const { d } = deps();
    const uploaded: string[] = [];
    const drive: DriveClient = { findFile: async () => null, uploadFile: async (_f, name, bytes) => { uploaded.push(`${name}:${new TextDecoder().decode(bytes)}`); return "id"; } };
    await syncTargets.drive(context(), { ...d, drive: () => drive });
    const html = uploaded.find((u) => u.startsWith("2556_NBC4821.html"))!;
    expect(html).toContain("Manila Auto Display");
    expect(html).toContain("Maria Santos");
  });
});
