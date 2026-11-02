import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createMockInventory } from "@/lib/inventory/mock";
import { createAdminClient } from "@/lib/supabase/admin";
import { processDueJobs } from "@/lib/sync/process";
import type { SyncDeps } from "@/lib/sync/targets";
import type { TelegramClient } from "@/lib/telegram";
import { fakeSheets } from "../fakes";

// Seeded local staff user (supabase/seed.sql).
const STAFF = "a0000000-0000-0000-0000-000000000002";
const PLATE = "SYNC" + String(Date.now()).slice(-6);
const RECEIPT_NO = "S" + String(Date.now()).slice(-8);

const admin = createAdminClient();
let receiptId: string;

function fakeDeps(overrides: Partial<SyncDeps> = {}) {
  const sheets = fakeSheets({ Receipts: [], Deals: [] });
  const drive = { findFile: vi.fn(async () => null), uploadFile: vi.fn(async () => "drive-123") };
  const telegram = {
    sendPhoto: vi.fn<TelegramClient["sendPhoto"]>(async () => {}),
    sendMessage: vi.fn<TelegramClient["sendMessage"]>(async () => {}),
  };
  const inventory = createMockInventory([{ plate: PLATE, status: "Available" }]);
  const deps: SyncDeps = {
    sheets: () => sheets.client,
    drive: () => drive,
    telegram: () => telegram,
    inventory,
    config: { driveFolderId: "folder", logSheetId: "log" },
    ...overrides,
  };
  return { deps, sheets, drive, telegram, inventory };
}

const jobs = async () =>
  (await admin.from("sync_jobs").select("*").eq("receipt_id", receiptId).order("target")).data!;

beforeAll(async () => {
  // A confirmed receipt with its photo, made the same way /api/confirm does.
  const draftId = crypto.randomUUID();
  const photoPath = `drafts/${STAFF}/${draftId}.jpg`;
  await admin.storage
    .from("receipt-photos")
    .upload(photoPath, new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }));
  await admin.from("receipt_drafts").insert({ id: draftId, photo_path: photoPath, status: "ready", created_by: STAFF });
  const { data, error } = await admin.rpc("confirm_receipt", {
    p_actor: STAFF,
    p_draft_id: draftId,
    p_payload: {
      receipt_no: RECEIPT_NO,
      plate_no: PLATE,
      amount: "50000",
      agreed_price: "500000",
      buyer_name: "Sync Test",
      marked_reservation: true,
      balance_due_date: "2026-11-05",
    },
  });
  if (error) throw error;
  receiptId = (data as { receipt_id: string }).receipt_id;
});

afterAll(async () => {
  const { data: receipt } = await admin.from("receipts").select("deal_id, photo_path").eq("id", receiptId).single();
  await admin.from("sync_jobs").delete().eq("receipt_id", receiptId);
  await admin.from("audit_logs").delete().eq("entity_id", receiptId);
  await admin.from("receipts").delete().eq("id", receiptId);
  if (receipt) {
    await admin.from("deals").delete().eq("id", receipt.deal_id);
    if (receipt.photo_path) await admin.storage.from("receipt-photos").remove([receipt.photo_path]);
  }
});

describe("processDueJobs", () => {
  it("leaves the receipt saved and records a readable error when a service is down", async () => {
    const f = fakeDeps({
      telegram: () => {
        throw new Error("Telegram sendPhoto failed: Unauthorized");
      },
    });
    const before = Date.now();
    const summary = await processDueJobs({ receiptId, deps: f.deps });
    expect(summary).toEqual({ claimed: 4, done: 3, failed: 1 });

    const telegram = (await jobs()).find((j) => j.target === "telegram")!;
    expect(telegram).toMatchObject({
      status: "failed",
      attempts: 1,
      last_error: "Telegram sendPhoto failed: Unauthorized",
    });
    // First retry is about 1 minute later.
    const wait = new Date(telegram.next_run_at).getTime() - before;
    expect(wait).toBeGreaterThan(55_000);
    expect(wait).toBeLessThan(70_000);

    // The receipt is untouched, and Drive's file id was saved.
    const { data: receipt } = await admin.from("receipts").select("status, drive_file_id").eq("id", receiptId).single();
    expect(receipt).toEqual({ status: "confirmed", drive_file_id: "drive-123" });
    expect(f.sheets.tabs.Receipts[1][20]).toBe("https://drive.google.com/file/d/drive-123/view");
    expect((await f.inventory.getUnit(PLATE))?.status).toBe("Reserved");
  });

  it("does not retry before the backoff time", async () => {
    const f = fakeDeps();
    expect(await processDueJobs({ receiptId, deps: f.deps })).toEqual({ claimed: 0, done: 0, failed: 0 });
  });

  it("completes the failed job once the key is fixed, and re-running does nothing", async () => {
    // Pretend the backoff has passed.
    await admin.from("sync_jobs").update({ next_run_at: new Date().toISOString() }).eq("receipt_id", receiptId).neq("status", "done");
    const f = fakeDeps();
    expect(await processDueJobs({ receiptId, deps: f.deps })).toEqual({ claimed: 1, done: 1, failed: 0 });
    expect(f.telegram.sendPhoto).toHaveBeenCalledTimes(1);
    expect(f.telegram.sendPhoto.mock.calls[0][1]).toContain(`🧾 Receipt #${RECEIPT_NO} · EARNEST`);
    expect((await jobs()).every((j) => j.status === "done")).toBe(true);

    const again = fakeDeps();
    expect(await processDueJobs({ receiptId, deps: again.deps })).toEqual({ claimed: 0, done: 0, failed: 0 });
    expect(again.telegram.sendPhoto).not.toHaveBeenCalled();
  });

  it("stops after 5 attempts", async () => {
    await admin
      .from("sync_jobs")
      .update({ status: "failed", attempts: 5, next_run_at: new Date(0).toISOString() })
      .eq("receipt_id", receiptId)
      .eq("target", "telegram");
    const f = fakeDeps();
    expect((await processDueJobs({ receiptId, deps: f.deps })).claimed).toBe(0);
  });
});
