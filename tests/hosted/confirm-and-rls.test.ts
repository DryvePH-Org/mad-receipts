import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// confirm_receipt outcomes, and what a logged-in staff member can and cannot do directly against
// the database. Marked data only (plates ZZT…, users zzt-rls-…@example.test), removed afterwards.

const admin = createAdminClient();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const password = `Zz1-${crypto.randomUUID()}`;
const users: Record<"one" | "two", { id: string; email: string; client: SupabaseClient }> = {
  one: { id: "", email: "zzt-rls-one@example.test", client: undefined as never },
  two: { id: "", email: "zzt-rls-two@example.test", client: undefined as never },
};
let counter = 0;
let david = "";

async function cleanup() {
  const { data: deals } = await admin.from("deals").select("id").like("plate_no", "ZZT9%");
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
  await admin.from("receipt_drafts").delete().like("photo_path", "drafts/zzt-rls/%");
  await admin.from("salespeople").delete().like("name", "ZZT RLS %");
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  for (const user of data?.users ?? []) {
    if (user.email?.startsWith("zzt-rls-")) {
      await admin.from("audit_logs").delete().eq("actor_id", user.id);
      await admin.auth.admin.deleteUser(user.id);
    }
  }
}

async function draft(owner: string, status = "ready") {
  const id = crypto.randomUUID();
  const { error } = await admin.from("receipt_drafts").insert({ id, photo_path: `drafts/zzt-rls/${id}.jpg`, status, created_by: owner });
  if (error) throw error;
  return id;
}

const plate = () => `ZZT9${String(++counter).padStart(3, "0")}`;
const payload = (p: string, over: Record<string, unknown> = {}) => ({
  receipt_no: `ZZT9-${p.slice(-3)}-${Math.random().toString(36).slice(2, 6)}`,
  plate_no: p,
  amount: "100000",
  agreed_price: "500000",
  buyer_name: "ZZT Buyer",
  marked_reservation: true,
  ...over,
});
const confirm = async (draftId: string, body: object) =>
  admin.rpc("confirm_receipt", { p_actor: users.one.id, p_draft_id: draftId, p_payload: body as never });

beforeAll(async () => {
  await cleanup();
  for (const key of ["one", "two"] as const) {
    const u = users[key];
    const created = await admin.auth.admin.createUser({ email: u.email, password, email_confirm: true, user_metadata: { full_name: `ZZT RLS ${key}` } });
    if (created.error) throw created.error;
    u.id = created.data.user.id;
    u.client = createClient(url, anonKey, { auth: { persistSession: false } });
    const signedIn = await u.client.auth.signInWithPassword({ email: u.email, password });
    if (signedIn.error) throw signedIn.error;
  }
  const sp = await admin.from("salespeople").insert({ name: "ZZT RLS David" }).select("id").single();
  if (sp.error) throw sp.error;
  david = sp.data.id;
});
afterAll(cleanup);

describe("confirm_receipt outcomes", () => {
  it("saves a receipt and opens a deal with the right balance", async () => {
    const p = plate();
    const { data, error } = await confirm(await draft(users.one.id), payload(p));
    expect(error).toBeNull();
    expect(data).toMatchObject({ receipt_id: expect.any(String), deal_id: expect.any(String) });
    const deal = (await admin.from("deals").select("status, total_paid, balance").eq("plate_no", p).single()).data!;
    expect([deal.status, Number(deal.total_paid), Number(deal.balance)]).toEqual(["open", 100000, 400000]);
  });

  it("refuses the same draft twice", async () => {
    const id = await draft(users.one.id);
    expect((await confirm(id, payload(plate()))).error).toBeNull();
    expect((await confirm(id, payload(plate()))).error?.message).toContain("draft_already_confirmed");
  });

  it("refuses a duplicate receipt number", async () => {
    const body = payload(plate());
    expect((await confirm(await draft(users.one.id), body)).error).toBeNull();
    expect((await confirm(await draft(users.one.id), { ...body, plate_no: plate() })).error?.message).toContain("duplicate_receipt_no");
  });

  it("refuses a draft that is not ready or does not exist", async () => {
    expect((await confirm(await draft(users.one.id, "extracting"), payload(plate()))).error?.message).toContain("draft_not_ready");
    expect((await confirm(crypto.randomUUID(), payload(plate()))).error?.message).toContain("draft_not_found");
  });

  it.each([
    ["invalid_amount", { amount: "0" }],
    ["invalid_amount", { amount: "-5" }],
    ["missing_plate", { plate_no: " " }],
    ["invalid_receipt_no", { receipt_no: "bad number!" }],
    ["missing_buyer_name", { buyer_name: " " }],
    ["invalid_agreed_price", { agreed_price: "0" }],
    ["overpayment", { amount: "600000" }],
  ])("refuses %s", async (code, over) => {
    const { error } = await confirm(await draft(users.one.id), payload(plate(), over));
    expect(error?.message).toContain(code);
  });

  it("does not let a payment go over what is still owed", async () => {
    const p = plate();
    expect((await confirm(await draft(users.one.id), payload(p, { amount: "450000" }))).error).toBeNull();
    expect((await confirm(await draft(users.one.id), payload(p, { amount: "100000" }))).error?.message).toContain("overpayment");
  });

  it("needs a salesperson to sell the car, and accepts one with a commission", async () => {
    const p = plate();
    const full = payload(p, { amount: "500000", marked_reservation: false });
    expect((await confirm(await draft(users.one.id), full)).error?.message).toContain("salesperson_required");
    const sold = await confirm(await draft(users.one.id), { ...full, receipt_no: `ZZT9-S-${counter}`, salespeople: [{ salesperson_id: david, commission_percent: "3" }] });
    expect(sold.error).toBeNull();
    expect((await admin.from("deals").select("status").eq("plate_no", p).single()).data!.status).toBe("completed");
  });

  it("queues the four sync jobs for a confirmed receipt", async () => {
    const { data } = await confirm(await draft(users.one.id), payload(plate()));
    const jobs = (await admin.from("sync_jobs").select("target").eq("receipt_id", (data as { receipt_id: string }).receipt_id)).data!;
    expect(jobs.map((j) => j.target).sort()).toEqual(["drive", "inventory", "sheets", "telegram"]);
  });
});

describe("row level security", () => {
  it("staff cannot call the confirm function themselves", async () => {
    const { error } = await users.one.client.rpc("confirm_receipt", { p_actor: users.one.id, p_draft_id: await draft(users.one.id), p_payload: payload(plate()) as never });
    expect(error).not.toBeNull();
  });

  it("staff only see their own drafts", async () => {
    const mine = await draft(users.one.id);
    const theirs = await draft(users.two.id);
    const seen = (await users.one.client.from("receipt_drafts").select("id")).data!.map((d) => d.id);
    expect(seen).toContain(mine);
    expect(seen).not.toContain(theirs);
  });

  it("staff cannot change or delete a draft", async () => {
    const id = await draft(users.one.id);
    await users.one.client.from("receipt_drafts").update({ status: "consumed" }).eq("id", id);
    await users.one.client.from("receipt_drafts").delete().eq("id", id);
    const row = (await admin.from("receipt_drafts").select("status").eq("id", id).single()).data!;
    expect(row.status).toBe("ready");
  });

  it("staff cannot write deals, receipts, salespeople or audit rows", async () => {
    const { data } = await confirm(await draft(users.one.id), payload(plate()));
    const { receipt_id, deal_id } = data as { receipt_id: string; deal_id: string };
    const c = users.two.client;
    expect((await c.from("deals").insert({ plate_no: "ZZT9999" } as never)).error).not.toBeNull();
    expect((await c.from("deals").update({ balance: 0 }).eq("id", deal_id).select()).data ?? []).toHaveLength(0);
    expect((await c.from("receipts").update({ amount: 1 }).eq("id", receipt_id).select()).data ?? []).toHaveLength(0);
    expect((await c.from("receipts").delete().eq("id", receipt_id).select()).data ?? []).toHaveLength(0);
    expect((await c.from("salespeople").insert({ name: "ZZT RLS hacker" })).error).not.toBeNull();
    expect((await c.from("audit_logs").insert({ action: "x", entity: "deal" } as never)).error).not.toBeNull();
    expect((await admin.from("deals").select("balance").eq("id", deal_id).single()).data!.balance).toBe(400000);
  });

  it("staff cannot read the audit log, sync jobs or other people's profiles", async () => {
    const c = users.one.client;
    expect((await c.from("audit_logs").select("id")).data ?? []).toHaveLength(0);
    expect((await c.from("sync_jobs").select("id")).data ?? []).toHaveLength(0);
    const ids = (await c.from("profiles").select("id")).data!.map((p) => p.id);
    expect(ids).toEqual([users.one.id]);
  });

  it("staff cannot promote themselves to admin", async () => {
    await users.one.client.from("profiles").update({ role: "admin" }).eq("id", users.one.id);
    expect((await admin.from("profiles").select("role").eq("id", users.one.id).single()).data!.role).toBe("staff");
  });

  it("a logged-out visitor reads nothing", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    for (const table of ["deals", "receipts", "receipt_drafts", "salespeople", "profiles"] as const) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      expect(error !== null || (data ?? []).length === 0, table).toBe(true);
    }
  });
});
