import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createMockInventory } from "@/lib/inventory/mock";
import { createAdminClient } from "@/lib/supabase/admin";
import { processDueJobs } from "@/lib/sync/process";
import type { SyncDeps } from "@/lib/sync/targets";
import { fakeSheets } from "../fakes";

// void_receipt, cancel_deal, update_deal_details, the list views and the sync events, on the
// hosted project. Everything it creates is marked (plates ZZT…, salespeople "ZZT …") and removed.

const admin = createAdminClient();
let actor: string; // an existing admin: used as the acting user and as "created by"
const ids = { david: "", ella: "", gone: "" };
let counter = 0;

const person = (id: string, percent: string) => ({ salesperson_id: id, commission_percent: percent });
const david = () => [person(ids.david, "3")];

async function cleanup() {
  const { data: deals } = await admin.from("deals").select("id").like("plate_no", "ZZT%");
  const dealIds = (deals ?? []).map((d) => d.id);
  if (dealIds.length) {
    const { data: receipts } = await admin.from("receipts").select("id").in("deal_id", dealIds);
    const receiptIds = (receipts ?? []).map((r) => r.id);
    if (receiptIds.length) {
      await admin.from("sync_jobs").delete().in("receipt_id", receiptIds);
      await admin.from("audit_logs").delete().in("entity_id", receiptIds);
    }
    await admin.from("audit_logs").delete().in("entity_id", dealIds);
    await admin.from("deal_salespeople").delete().in("deal_id", dealIds);
    await admin.from("receipts").delete().in("deal_id", dealIds);
    await admin.from("deals").delete().in("id", dealIds);
  }
  await admin.from("receipt_drafts").delete().like("photo_path", "drafts/zzt/%");
  const { data: files } = await admin.storage.from("receipt-photos").list("drafts/zzt", { limit: 200 });
  if (files?.length) await admin.storage.from("receipt-photos").remove(files.map((f) => `drafts/zzt/${f.name}`));
  const { data: people } = await admin.from("salespeople").select("id").like("name", "ZZT %");
  const personIds = (people ?? []).map((p) => p.id);
  if (personIds.length) {
    await admin.from("audit_logs").delete().in("entity_id", personIds);
    await admin.from("salespeople").delete().in("id", personIds);
  }
}

/** Confirms a receipt the way /api/confirm does (without the photo move). */
async function confirm(
  no: string,
  plate: string,
  amount: string,
  options: { people?: unknown; due?: string; reservation?: boolean; photo?: boolean } = {},
) {
  const draftId = crypto.randomUUID();
  const photoPath = `drafts/zzt/${draftId}.jpg`;
  if (options.photo) {
    await admin.storage.from("receipt-photos").upload(photoPath, new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }));
  }
  const draft = await admin.from("receipt_drafts").insert({ id: draftId, photo_path: photoPath, status: "ready", created_by: actor });
  if (draft.error) throw draft.error;
  const { data, error } = await admin.rpc("confirm_receipt", {
    p_actor: actor,
    p_draft_id: draftId,
    p_payload: {
      receipt_no: `ZZT${no}`,
      plate_no: plate,
      amount,
      agreed_price: "500000",
      buyer_name: `Buyer ${plate}`,
      marked_reservation: options.reservation ?? false,
      balance_due_date: options.due ?? null,
      ...(options.people ? { salespeople: options.people } : {}),
    } as never,
  });
  if (error) throw new Error(error.message);
  return data as { receipt_id: string; deal_id: string };
}

const plate = () => `ZZT${String(++counter).padStart(4, "0")}`;
const receiptId = async (no: string) => (await admin.from("receipts").select("id").eq("receipt_no", `ZZT${no}`).single()).data!.id;
const dealOf = async (p: string) => (await admin.from("deals").select("*").eq("plate_no", p).order("created_at", { ascending: false }).limit(1).single()).data!;
const voidReceipt = async (no: string, reason = "wrong amount") =>
  admin.rpc("void_receipt", { p_actor: actor, p_receipt_id: await receiptId(no), p_reason: reason });
const cancelDeal = (dealId: string, reason = "buyer backed out", forfeit = true) => admin.rpc("cancel_deal", { p_actor: actor, p_deal_id: dealId, p_reason: reason, p_forfeit: forfeit });
const editDeal = (dealId: string, patch: object, people: unknown = null) =>
  admin.rpc("update_deal_details", { p_actor: actor, p_deal_id: dealId, p_patch: patch as never, p_salespeople: people as never });
const jobs = async (rid: string, event: string) => (await admin.from("sync_jobs").select("target, status").eq("receipt_id", rid).eq("event", event)).data ?? [];

beforeAll(async () => {
  const { data } = await admin.from("profiles").select("id").eq("role", "admin").limit(1).maybeSingle();
  if (!data) throw new Error("No admin profile on the hosted project: create the admin account first");
  actor = data.id;
  await cleanup(); // clean BEFORE, in case an earlier run was interrupted
  const { data: sp, error } = await admin
    .from("salespeople")
    .insert([{ name: "ZZT David", active: true }, { name: "ZZT Ella", active: true }, { name: "ZZT Gone", active: false }])
    .select("id, name");
  if (error) throw error;
  ids.david = sp.find((p) => p.name === "ZZT David")!.id;
  ids.ella = sp.find((p) => p.name === "ZZT Ella")!.id;
  ids.gone = sp.find((p) => p.name === "ZZT Gone")!.id;
});
afterAll(cleanup); // and clean AFTER

describe("void_receipt", () => {
  it("voids the latest receipt of a sold deal: the deal reopens and totals are recomputed", async () => {
    const p = plate();
    await confirm("101", p, "100000", { people: david(), due: "2026-11-10", reservation: true });
    await confirm("102", p, "100000", { due: "2026-11-20" });
    const last = await confirm("103", p, "300000");
    expect((await dealOf(p)).status).toBe("completed");

    const { error } = await voidReceipt("103");
    expect(error).toBeNull();
    const deal = await dealOf(p);
    expect([deal.status, Number(deal.total_paid), Number(deal.balance)]).toEqual(["open", 200000, 300000]);
    const receipt = (await admin.from("receipts").select("status, void_reason").eq("id", last.receipt_id).single()).data!;
    expect(receipt).toEqual({ status: "voided", void_reason: "wrong amount" });

    // Void jobs for sheets, telegram and inventory (not drive), next to the 4 confirm jobs.
    const voidJobs = await jobs(last.receipt_id, "void");
    expect(voidJobs.map((j) => `${j.target}:${j.status}`).sort()).toEqual(["inventory:pending", "sheets:pending", "telegram:pending"]);
    expect(await jobs(last.receipt_id, "confirm")).toHaveLength(4);

    const audit = (await admin.from("audit_logs").select("before, after").eq("action", "receipt.void").eq("entity_id", last.receipt_id).single()).data!;
    expect((audit.before as { deal: { status: string } }).deal.status).toBe("completed");
    expect((audit.after as { deal: { status: string } }).deal.status).toBe("open");

    // Voiding backward: the next receipt up is now the latest, and the due date follows the remaining one.
    expect((await voidReceipt("102", "duplicate")).error).toBeNull();
    expect(Number((await dealOf(p)).total_paid)).toBe(100000);
    const summary = (await admin.from("deal_summaries").select("next_due_date, receipt_count").eq("plate_no", p).single()).data!;
    expect(summary).toEqual({ next_due_date: "2026-11-10", receipt_count: 1 });
  });

  it.each([
    ["only_receipt", async () => voidReceipt("101")],
    ["already_voided", async () => voidReceipt("103")],
    ["reason_required", async () => voidReceipt("101", " ")],
    ["reason_required", async () => voidReceipt("101", "ab")],
  ])("rejects with %s", async (code, run) => {
    expect((await run()).error?.message).toBe(code);
  });

  it("rejects an unknown receipt", async () => {
    const { error } = await admin.rpc("void_receipt", { p_actor: actor, p_receipt_id: crypto.randomUUID(), p_reason: "because" });
    expect(error?.message).toBe("receipt_not_found");
  });

  it("only the latest receipt can be voided", async () => {
    const p = plate();
    await confirm("201", p, "100000", { people: david(), reservation: true });
    await confirm("202", p, "100000");
    expect((await voidReceipt("201")).error?.message).toBe("not_latest");
  });

  it("a cancelled deal's receipts cannot be voided", async () => {
    const p = plate();
    await confirm("301", p, "100000", { people: david(), reservation: true });
    await confirm("302", p, "50000");
    expect((await cancelDeal((await dealOf(p)).id)).error).toBeNull();
    expect((await voidReceipt("302")).error?.message).toBe("deal_cancelled");
  });

  it("a sold deal cannot reopen while its plate has another open deal", async () => {
    const p = plate();
    await confirm("401", p, "100000", { people: david(), reservation: true });
    await confirm("402", p, "400000"); // sold
    await confirm("403", p, "100000", { people: david(), reservation: true }); // new open deal, same plate
    expect((await voidReceipt("402")).error?.message).toBe("plate_has_open_deal");
  });
});

describe("cancel_deal", () => {
  it("cancels an open deal, forfeits the money, queues jobs and audits", async () => {
    const p = plate();
    const first = await confirm("501", p, "100000", { people: david(), reservation: true });
    const second = await confirm("502", p, "50000");
    const deal = await dealOf(p);
    expect((await cancelDeal(deal.id, "buyer backed out", true)).error).toBeNull();

    const after = await dealOf(p);
    expect([after.status, after.cancel_reason, after.forfeited]).toEqual(["cancelled", "buyer backed out", true]);
    // Jobs hang off the deal's latest receipt.
    expect((await jobs(second.receipt_id, "cancel")).map((j) => j.target).sort()).toEqual(["inventory", "sheets", "telegram"]);
    expect(await jobs(first.receipt_id, "cancel")).toHaveLength(0);
    const audit = (await admin.from("audit_logs").select("before, after").eq("action", "deal.cancel").eq("entity_id", deal.id).single()).data!;
    expect([(audit.before as { status: string }).status, (audit.after as { status: string }).status]).toEqual(["open", "cancelled"]);

    // The plate is free again.
    await confirm("503", p, "100000", { reservation: true });
    expect((await admin.from("deals").select("id", { count: "exact", head: true }).eq("plate_no", p).eq("status", "open")).count).toBe(1);
  });

  it("can leave the money not forfeited", async () => {
    const p = plate();
    await confirm("511", p, "100000", { people: david(), reservation: true });
    await cancelDeal((await dealOf(p)).id, "changed mind", false);
    expect((await dealOf(p)).forfeited).toBe(false);
  });

  it("rejects bad requests", async () => {
    const p = plate();
    await confirm("521", p, "500000", { people: david() }); // sold in one payment
    const sold = await dealOf(p);
    expect((await cancelDeal(sold.id)).error?.message).toBe("deal_not_open");
    expect((await cancelDeal(sold.id, "ab")).error?.message).toBe("reason_required");
    expect((await cancelDeal(crypto.randomUUID())).error?.message).toBe("deal_not_found");
    const open = plate();
    await confirm("522", open, "100000", { people: david(), reservation: true });
    const deal = await dealOf(open);
    await cancelDeal(deal.id);
    expect((await cancelDeal(deal.id, "twice")).error?.message).toBe("deal_not_open");
  });
});

describe("update_deal_details", () => {
  it("updates details, clears blanks, leaves other keys, audits, and queues sheets + inventory", async () => {
    const p = plate();
    const first = await confirm("601", p, "100000", { people: david(), reservation: true });
    const deal = await dealOf(p);

    expect((await editDeal(deal.id, { buyer_name: "  Jose P. Rizal ", color: "Blue", buyer_address: "" })).error).toBeNull();
    const after = await dealOf(p);
    expect([after.buyer_name, after.color, after.buyer_address]).toEqual(["Jose P. Rizal", "Blue", null]);
    expect([Number(after.agreed_price), after.plate_no]).toEqual([500000, p]); // never changed here

    const audit = (await admin.from("audit_logs").select("before, after").eq("action", "deal.update").eq("entity_id", deal.id).single()).data!;
    expect((audit.before as { deal: { buyer_name: string } }).deal.buyer_name).toBe(`Buyer ${p}`);
    expect((audit.after as { deal: { buyer_name: string } }).deal.buyer_name).toBe("Jose P. Rizal");
    expect((await jobs(first.receipt_id, "edit")).map((j) => j.target).sort()).toEqual(["inventory", "sheets"]);
  });

  it("replaces salespeople with their own percents, and an empty list changes nothing", async () => {
    const p = plate();
    await confirm("611", p, "100000", { people: david(), reservation: true });
    const deal = await dealOf(p);
    expect((await editDeal(deal.id, {}, [person(ids.ella, "2.5"), person(ids.david, "1")])).error).toBeNull();
    const rows = (await admin.from("deal_salespeople").select("salesperson_id, commission_percent").eq("deal_id", deal.id)).data!;
    expect(rows.map((r) => [r.salesperson_id, Number(r.commission_percent)]).sort()).toEqual(
      [[ids.ella, 2.5], [ids.david, 1]].sort(),
    );
    expect((await editDeal(deal.id, {}, [])).error).toBeNull();
    expect((await admin.from("deal_salespeople").select("salesperson_id").eq("deal_id", deal.id)).data).toHaveLength(2);
  });

  it.each([
    ["invalid_details", { plate_no: "HACK" }, null],
    ["invalid_details", { agreed_price: "1" }, null],
    ["missing_buyer_name", { buyer_name: "  " }, null],
    ["invalid_details", { color: "x".repeat(51) }, null],
    ["invalid_details", [], null],
    ["invalid_salespeople", {}, () => [person(ids.gone, "3")]],
    ["invalid_salespeople", {}, () => [person(ids.david, "101")]],
  ] as const)("rejects with %s", async (code, patch, people) => {
    const p = plate();
    await confirm(`62${counter}`, p, "100000", { people: david(), reservation: true });
    const { error } = await editDeal((await dealOf(p)).id, patch as object, people ? people() : null);
    expect(error?.message).toBe(code);
  });

  it("rejects an unknown deal", async () => {
    expect((await editDeal(crypto.randomUUID(), {})).error?.message).toBe("deal_not_found");
  });
});

describe("queue_sync and the views", () => {
  it("queue_sync resets a failed job", async () => {
    const p = plate();
    const r = await confirm("701", p, "100000", { people: david(), reservation: true });
    await editDeal((await dealOf(p)).id, {});
    await admin.from("sync_jobs").update({ status: "failed", attempts: 5, last_error: "boom" }).eq("receipt_id", r.receipt_id).eq("event", "edit").eq("target", "sheets");
    await admin.rpc("queue_sync", { p_receipt_id: r.receipt_id, p_event: "edit", p_targets: ["sheets"] });
    const job = (await admin.from("sync_jobs").select("status, attempts, last_error").eq("receipt_id", r.receipt_id).eq("event", "edit").eq("target", "sheets").single()).data!;
    expect(job).toEqual({ status: "pending", attempts: 0, last_error: null });
  });

  it("deal_summaries and receipt_list show what the pages need", async () => {
    const open = plate();
    await confirm("711", open, "100000", { people: david(), due: "2026-12-01", reservation: true });
    const sold = plate();
    await confirm("712", sold, "500000", { people: david() });
    const s1 = (await admin.from("deal_summaries").select("*").eq("plate_no", open).single()).data!;
    expect([s1.next_due_date, s1.last_receipt_no, s1.receipt_count]).toEqual(["2026-12-01", "ZZT711", 1]);
    const s2 = (await admin.from("deal_summaries").select("*").eq("plate_no", sold).single()).data!;
    expect([s2.next_due_date, s2.status]).toEqual([null, "completed"]);
    const row = (await admin.from("receipt_list").select("*").eq("receipt_no", "ZZT711").single()).data!;
    expect([row.plate_no, row.buyer_name, row.deal_status]).toEqual([open, `Buyer ${open}`, "open"]);
  });
});

describe("access with the browser key", () => {
  const anon = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

  it("cannot read the lists or call the admin functions", async () => {
    expect((await anon.from("deal_summaries").select("id").limit(1)).error?.code).toBe("42501");
    expect((await anon.from("receipt_list").select("id").limit(1)).error?.code).toBe("42501");
    const z = crypto.randomUUID();
    expect((await anon.rpc("void_receipt", { p_actor: z, p_receipt_id: z, p_reason: "x" })).error?.code).toBe("42501");
    expect((await anon.rpc("cancel_deal", { p_actor: z, p_deal_id: z, p_reason: "x", p_forfeit: true })).error?.code).toBe("42501");
    expect((await anon.rpc("update_deal_details", { p_actor: z, p_deal_id: z, p_patch: {}, p_salespeople: null })).error?.code).toBe("42501");
    expect((await anon.rpc("queue_sync", { p_receipt_id: z, p_event: "void", p_targets: ["sheets"] })).error?.code).toBe("42501");
  });
});

describe("the sync runner handles the new events", () => {
  it("announces a void, marks the row Voided, and refreshes the unit status", async () => {
    const p = plate();
    await confirm("801", p, "100000", { people: david(), reservation: true, photo: true });
    const last = await confirm("802", p, "400000", { photo: true }); // sold
    expect((await voidReceipt("802", "typo in the amount")).error).toBeNull();

    const sheets = fakeSheets({ Receipts: [], Deals: [] });
    const telegram = { sendPhoto: vi.fn(async () => {}), sendMessage: vi.fn(async () => {}) };
    const inventory = createMockInventory([{ plate: p, status: "Sold" }]);
    const deps: SyncDeps = {
      sheets: () => sheets.client,
      drive: () => ({ findFile: async () => null, uploadFile: async () => "drive-file" }),
      telegram: () => telegram,
      inventory,
      config: { driveFolderId: "folder", logSheetId: "log" },
    };
    const summary = await processDueJobs({ receiptId: last.receipt_id, deps });
    expect(summary).toMatchObject({ claimed: 7, failed: 0 }); // 4 confirm + 3 void

    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
    const message = (telegram.sendMessage.mock.calls as unknown as [string][])[0][0];
    expect(message).toContain("⚠️ Receipt #ZZT802 VOIDED");
    expect(message).toContain("Reason: typo in the amount");
    expect(message).toContain("Unit: Reserved");
    const receiptsTab = sheets.tabs.Receipts;
    expect(receiptsTab.filter((r) => r[1] === "ZZT802")).toHaveLength(1);
    expect(receiptsTab.find((r) => r[1] === "ZZT802")![22]).toBe("Voided");
    expect((await inventory.getUnit(p))?.status).toBe("Reserved");
    expect((await jobs(last.receipt_id, "void")).every((j) => j.status === "done")).toBe(true);
  });
});
