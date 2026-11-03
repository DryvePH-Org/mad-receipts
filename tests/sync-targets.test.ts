import { describe, expect, it, vi } from "vitest";
import type { DriveClient } from "@/lib/google/drive";
import { createMockInventory } from "@/lib/inventory/mock";
import {
  DEAL_HEADERS,
  RECEIPT_HEADERS,
  cancelMessage,
  syncTargets,
  telegramCaption,
  voidMessage,
  type SyncContext,
  type SyncDeps,
} from "@/lib/sync/targets";
import type { TelegramClient } from "@/lib/telegram";
import { fakeSheets } from "./fakes";

const PHOTO = new Uint8Array([0xff, 0xd8, 0xff]);

function context(overrides: { receipt?: Partial<SyncContext["receipt"]>; deal?: Partial<SyncContext["deal"]> } = {}): SyncContext {
  return {
    receipt: {
      id: "r1",
      deal_id: "d1",
      receipt_no: "2556",
      receipt_date: "2026-11-02",
      amount: 50000,
      payment_type: "earnest",
      paper_payment_type: "earnest",
      payment_method: "cash",
      check_no: null,
      bank_branch: null,
      balance_after: 450000,
      balance_due_date: "2026-11-05",
      amount_words: "Fifty Thousand Only",
      balance_words: "Four Hundred Fifty Thousand",
      photo_path: "receipts/2556.jpg",
      drive_file_id: null,
      extraction_raw: null,
      status: "confirmed",
      void_reason: null,
      created_by: "u1",
      created_at: "2026-11-02T07:30:00Z",
      ...overrides.receipt,
    },
    deal: {
      id: "d1",
      plate_no: "NKF4771",
      make_type: "2021 Honda Civic",
      color: "Black",
      motor_no: null,
      chassis_no: null,
      buyer_name: "Jose Rizal",
      buyer_address: "16 San Fernando, Kapitolyo, Pasig City",
      buyer_contact: null,
      agreed_price: 500000,
      total_paid: 50000,
      balance: 450000,
      status: "open",
      cancel_reason: null,
      forfeited: false,
      created_by: "u1",
      created_at: "2026-11-02T07:30:00Z",
      updated_at: "2026-11-02T07:30:00Z",
      ...overrides.deal,
    },
    confirmedBy: "Test Staff",
    salesperson: "David",
    salespeople: [],
    event: "confirm",
    lastReceiptNo: "2556",
    lastReceiptAt: "2026-11-02T07:30:00Z",
    photo: async () => PHOTO,
  };
}

function deps(overrides: Partial<SyncDeps> = {}) {
  const sheets = fakeSheets({ Receipts: [], Deals: [] });
  const drive = { findFile: vi.fn(async () => null), uploadFile: vi.fn(async () => "drive-file-1") } satisfies DriveClient;
  const telegram = {
    sendPhoto: vi.fn<TelegramClient["sendPhoto"]>(async () => {}),
    sendMessage: vi.fn<TelegramClient["sendMessage"]>(async () => {}),
  };
  const inventory = createMockInventory([{ plate: "NKF4771", status: "Available" }]);
  const all: SyncDeps = {
    sheets: () => sheets.client,
    drive: () => drive,
    telegram: () => telegram,
    inventory,
    config: { driveFolderId: "folder-1", logSheetId: "log-1" },
    ...overrides,
  };
  return { all, sheets, drive, telegram, inventory };
}

describe("drive target", () => {
  it("uploads the photo as {receipt_no}_{plate}.jpg and returns the file id", async () => {
    const d = deps();
    expect(await syncTargets.drive(context(), d.all)).toEqual({ driveFileId: "drive-file-1" });
    expect(d.drive.uploadFile).toHaveBeenCalledWith("folder-1", "2556_NKF4771.jpg", PHOTO, "image/jpeg");
  });

  it("is idempotent: reuses an earlier upload instead of uploading twice", async () => {
    const d = deps();
    d.drive.findFile.mockResolvedValueOnce("already-there" as never);
    expect(await syncTargets.drive(context(), d.all)).toEqual({ driveFileId: "already-there" });
    expect(d.drive.uploadFile).not.toHaveBeenCalled();

    await syncTargets.drive(context({ receipt: { drive_file_id: "saved" } }), d.all);
    expect(d.drive.findFile).toHaveBeenCalledTimes(1); // nothing to do once saved
  });

  it("fails clearly when the folder is not configured", async () => {
    const d = deps({ config: {} });
    await expect(syncTargets.drive(context(), d.all)).rejects.toThrow("GOOGLE_DRIVE_FOLDER_ID is not set");
  });
});

describe("sheets target", () => {
  it("writes headers, a Receipts row and a Deals row", async () => {
    const d = deps();
    await syncTargets.sheets(context({ receipt: { drive_file_id: "f9" } }), d.all);
    const { Receipts, Deals } = d.sheets.tabs;

    expect(Receipts[0]).toEqual(RECEIPT_HEADERS);
    expect(Object.fromEntries(RECEIPT_HEADERS.map((h, i) => [h, Receipts[1][i]]))).toEqual({
      Timestamp: "2026-11-02 15:30",
      "Receipt No": "2556",
      Date: "2026-11-02",
      Buyer: "Jose Rizal",
      Address: "16 San Fernando, Kapitolyo, Pasig City",
      Contact: "",
      Plate: "NKF4771",
      "Make/Type": "2021 Honda Civic",
      Color: "Black",
      Motor: "",
      Chassis: "",
      "Payment Type": "Earnest",
      Amount: 50000,
      "Agreed Price": 500000,
      "Total Paid": 50000,
      Balance: 450000,
      Method: "Cash",
      "Check No": "",
      "Bank/Branch": "",
      "Balance Due Date": "2026-11-05",
      "Photo Link": "https://drive.google.com/file/d/f9/view",
      "Confirmed By": "Test Staff",
      Status: "Confirmed",
    });
    expect(Deals).toEqual([DEAL_HEADERS, ["d1", "NKF4771", "Jose Rizal", 500000, 50000, 450000, "Open", "2556", ""]]);
  });

  it("does not duplicate a receipt row, and updates the deal row in place", async () => {
    const d = deps();
    await syncTargets.sheets(context(), d.all);
    await syncTargets.sheets(context(), d.all); // re-run
    expect(d.sheets.tabs.Receipts).toHaveLength(2);

    const second = context({
      receipt: { id: "r2", receipt_no: "2557", amount: 450000, balance_after: 0, payment_type: "full" },
      deal: { total_paid: 500000, balance: 0, status: "completed" },
    });
    second.lastReceiptNo = "2557";
    second.salespeople = [
      { name: "David", percent: 3 },
      { name: "Ella", percent: 1.5 },
    ];
    await syncTargets.sheets(second, d.all);
    expect(d.sheets.tabs.Receipts).toHaveLength(3);
    expect(d.sheets.tabs.Deals).toEqual([
      DEAL_HEADERS,
      ["d1", "NKF4771", "Jose Rizal", 500000, 500000, 0, "Completed", "2557", "David 3%, Ella 1.5%"],
    ]);
  });

  it("keeps rows staff added above, and appends below them", async () => {
    const d = deps();
    d.sheets.tabs.Receipts.push(RECEIPT_HEADERS, ["manual row", "1999"]);
    await syncTargets.sheets(context(), d.all);
    expect(d.sheets.tabs.Receipts.map((r) => r[1])).toEqual(["Receipt No", "1999", "2556"]);
  });

  it("explains a missing tab", async () => {
    const sheets = fakeSheets({ Deals: [] });
    const d = deps({ sheets: () => sheets.client });
    await expect(syncTargets.sheets(context(), d.all)).rejects.toThrow('Tab "Receipts" was not found');
  });
});

describe("telegram target", () => {
  it("sends the photo with the summary caption", async () => {
    const d = deps();
    await syncTargets.telegram(context(), d.all);
    expect(d.telegram.sendPhoto).toHaveBeenCalledWith(
      PHOTO,
      [
        "🧾 Receipt #2556 · EARNEST",
        "Jose Rizal",
        "2021 Honda Civic · NKF4771",
        "Paid ₱50,000 · Balance ₱450,000 · Due Nov 5, 2026",
        "Unit: Reserved",
      ].join("\n"),
    );
  });

  it("drops the due date once fully paid", () => {
    const caption = telegramCaption(
      context({ receipt: { receipt_no: "2557", amount: 450000, balance_after: 0, payment_type: "full" } }),
    );
    expect(caption).toContain("🧾 Receipt #2557 · FULL");
    expect(caption).toContain("Paid ₱450,000 · Balance ₱0\nUnit: Sold");
  });
});

describe("inventory target", () => {
  it("writes the status for the deal's current state", async () => {
    const d = deps();
    await syncTargets.inventory(context(), d.all);
    expect((await d.inventory.getUnit("NKF4771"))?.status).toBe("Reserved");
    await syncTargets.inventory(context({ deal: { status: "completed" } }), d.all);
    expect((await d.inventory.getUnit("NKF4771"))?.status).toBe("Sold");
    await syncTargets.inventory(context({ deal: { status: "cancelled" } }), d.all);
    expect((await d.inventory.getUnit("NKF4771"))?.status).toBe("Available");
  });

  it("passes the deal's salespeople with their percents, and the date in Manila", async () => {
    const d = deps();
    // Reserved, nobody recorded yet: the staff who opened the deal.
    await syncTargets.inventory(context(), d.all);
    // Sold, with two salespeople.
    const sold = context({
      receipt: { receipt_no: "2557", created_at: "2026-11-04T01:00:00Z" },
      deal: { status: "completed", total_paid: 500000, balance: 0 },
    });
    sold.salespeople = [
      { name: "David", percent: 3 },
      { name: "Ella", percent: 1.5 },
    ];
    sold.lastReceiptNo = "2557";
    sold.lastReceiptAt = "2026-11-04T01:00:00Z";
    await syncTargets.inventory(sold, d.all);
    expect(d.inventory.changes.map((c) => [c.status, c.ref])).toEqual([
      ["Reserved", { receiptNo: "2556", people: [{ name: "David", percent: null }], date: "11/2" }],
      [
        "Sold",
        {
          receiptNo: "2557",
          people: [
            { name: "David", percent: 3 },
            { name: "Ella", percent: 1.5 },
          ],
          date: "11/4",
        },
      ],
    ]);
  });
});

describe("sync events: void, cancel and edit", () => {
  const withEvent = (event: "void" | "cancel" | "edit", overrides: Parameters<typeof context>[0] = {}) => ({
    ...context(overrides),
    event,
  });

  it("drive uploads only for a confirmed receipt", async () => {
    const d = deps();
    for (const event of ["void", "cancel", "edit"] as const) {
      expect(await syncTargets.drive(withEvent(event), d.all)).toBeUndefined();
    }
    expect(d.drive.uploadFile).not.toHaveBeenCalled();
  });

  it("void: marks the receipt row Voided in place and refreshes the deal row", async () => {
    const d = deps();
    await syncTargets.sheets(context(), d.all); // confirmed earlier
    const voided = withEvent("void", { receipt: { status: "voided", void_reason: "wrong amount" }, deal: { total_paid: 0, balance: 500000 } });
    await syncTargets.sheets(voided, d.all);
    const { Receipts, Deals } = d.sheets.tabs;
    expect(Receipts).toHaveLength(2); // not appended again
    expect(Receipts[1][RECEIPT_HEADERS.indexOf("Status")]).toBe("Voided");
    expect(Deals[1][DEAL_HEADERS.indexOf("Balance")]).toBe(500000);
  });

  it("cancel and edit only change the deal row, never the Receipts tab", async () => {
    const d = deps();
    await syncTargets.sheets(context(), d.all);
    const before = JSON.stringify(d.sheets.tabs.Receipts);
    await syncTargets.sheets(withEvent("cancel", { deal: { status: "cancelled" } }), d.all);
    await syncTargets.sheets(withEvent("edit", { deal: { buyer_name: "Jose P. Rizal" } }), d.all);
    expect(JSON.stringify(d.sheets.tabs.Receipts)).toBe(before);
    expect(d.sheets.tabs.Deals[1][DEAL_HEADERS.indexOf("Buyer")]).toBe("Jose P. Rizal");
  });

  it("telegram announces a void and a cancel, but not an edit", async () => {
    const d = deps();
    await syncTargets.telegram(withEvent("void", { receipt: { status: "voided", void_reason: "wrong amount", receipt_no: "2557" }, deal: { total_paid: 50000, balance: 450000 } }), d.all);
    await syncTargets.telegram(withEvent("cancel", { deal: { status: "cancelled", cancel_reason: "buyer backed out", forfeited: true } }), d.all);
    await syncTargets.telegram(withEvent("edit"), d.all);
    expect(d.telegram.sendPhoto).not.toHaveBeenCalled();
    expect(d.telegram.sendMessage.mock.calls.map(([text]) => text)).toEqual([
      ["⚠️ Receipt #2557 VOIDED", "Jose Rizal", "2021 Honda Civic · NKF4771", "Reason: wrong amount", "Paid ₱50,000 · Balance ₱450,000", "Unit: Reserved"].join("\n"),
      ["❌ Deal CANCELLED", "Jose Rizal", "2021 Honda Civic · NKF4771", "Reason: buyer backed out", "Forfeited ₱50,000", "Unit: Available"].join("\n"),
    ]);
  });

  it("a cancel message says when the money is not forfeited", () => {
    expect(cancelMessage(withEvent("cancel", { deal: { status: "cancelled", cancel_reason: "x", forfeited: false } }))).toContain("Paid ₱50,000 (not forfeited)");
    expect(voidMessage(withEvent("void", { receipt: { status: "voided", void_reason: null } }))).toContain("Reason: —");
  });

  it("inventory follows the deal: a cancel clears the status, a void of a sold deal reserves again", async () => {
    const d = deps();
    await syncTargets.inventory(withEvent("cancel", { deal: { status: "cancelled" } }), d.all);
    await syncTargets.inventory(withEvent("void", { deal: { status: "open" } }), d.all);
    expect(d.inventory.changes.map((c) => c.status)).toEqual(["Available", "Reserved"]);
  });
});
