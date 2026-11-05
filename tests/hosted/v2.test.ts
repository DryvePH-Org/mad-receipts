import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

// The version 2 backend on the HOSTED project: the real functions, access rules and storage policy.
// Marked rows only (receipts "ZZT-HOSTED…", users "zzt-hosted-…"), removed before and after.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
const PREFIX = "ZZT-HOSTED";
const users: Record<string, { id: string; email: string; password: string }> = {};

async function cleanup() {
  const { data: receipts } = await admin.from("receipts").select("id, deal_id").like("receipt_no", `${PREFIX}%`);
  const ids = (receipts ?? []).map((r) => r.id), deals = [...new Set((receipts ?? []).map((r) => r.deal_id))];
  if (ids.length) {
    await admin.from("sync_jobs").delete().in("receipt_id", ids);
    await admin.from("audit_logs").delete().in("entity_id", ids);
    await admin.from("receipts").delete().in("id", ids);
  }
  if (deals.length) { await admin.from("audit_logs").delete().in("entity_id", deals); await admin.from("deals").delete().in("id", deals); }
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
  for (const u of list?.users ?? []) if (u.email?.startsWith("zzt-hosted-")) {
    const { data: files } = await admin.storage.from("payment-proofs").list(u.id);
    if (files?.length) await admin.storage.from("payment-proofs").remove(files.map((f) => `${u.id}/${f.name}`));
    await admin.from("audit_logs").delete().eq("actor_id", u.id);
    await admin.from("app_settings").delete().eq("updated_by", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
}
const signedIn = async (who: string) => {
  const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: users[who].email, password: users[who].password });
  if (error) throw error;
  return c;
};

beforeAll(async () => {
  await cleanup();
  for (const role of ["sales", "approver", "admin"]) {
    const email = `zzt-hosted-${role}@example.test`, password = `Zz1-hosted-${role}-pass`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `ZZT ${role}` } });
    if (error) throw error;
    if (role !== "sales") await admin.from("profiles").update({ role }).eq("id", data.user.id);
    users[role] = { id: data.user.id, email, password };
  }
});
afterAll(cleanup);

const payload = (actor: string, over: Record<string, unknown> = {}) => ({
  receipt_no: `${PREFIX}-${crypto.randomUUID().slice(0, 6)}`, receipt_date: "2026-11-04", kind: "partial",
  buyer: { name: "ZZT Buyer", address: "Pasig", contact: "09171234567" },
  units: [{ make_type: "2023 Toyota Vios", plate: `ZZT${Math.floor(Math.random() * 9000 + 1000)}`, motor: "M", chassis: "C", color: "Silver" }],
  price: "720000", sale_type: "financing", institution: "BDO", down_payment: "150000", processing_fee: "39900", trade_in: { value: "60000", unit: "Old Vios" },
  due: { mode: "date", date: "2026-12-15" }, payments: [{ method: "cash", amount: "40000", attachments: [{ path: `${actor}/proof.jpg`, filename: "proof.jpg", mime: "image/jpeg", size: 100 }] }], ...over,
});

describe("the hosted v2 backend", () => {
  it("the new tables exist and the old photo tables are gone", async () => {
    expect((await admin.from("deals").select("id").limit(1)).error).toBeNull();
    expect((await admin.from("receipt_drafts").select("id").limit(1)).error).not.toBeNull();
    expect((await admin.from("deal_summaries").select("balance").limit(1)).error).toBeNull();
  });

  it("submit, approve, and the numbers are right", async () => {
    const { data, error } = await admin.rpc("submit_receipt", { p_actor: users.sales.id, p_payload: payload(users.sales.id), p_require_proofs: true });
    expect(error).toBeNull();
    const r = data as { deal_id: string; receipt_id: string };
    const own = await admin.rpc("review_receipt", { p_actor: users.sales.id, p_receipt_id: r.receipt_id, p_approve: true });
    expect(own.error).not.toBeNull(); // nobody approves their own receipt
    const ok = await admin.rpc("review_receipt", { p_actor: users.approver.id, p_receipt_id: r.receipt_id, p_approve: true });
    expect(ok.error).toBeNull();
    const { data: s } = await admin.from("deal_summaries").select("balance, loan_amount, processing_fee").eq("id", r.deal_id).single();
    expect([Number(s?.balance), Number(s?.loan_amount), Number(s?.processing_fee)]).toEqual([50000, 570000, 39900]); // 150,000 − 60,000 trade-in − 40,000
  });

  it("signed-in people read but cannot write or call the functions", async () => {
    const sales = await signedIn("sales");
    expect((await sales.from("deal_summaries").select("id").limit(1)).error).toBeNull();
    expect((await sales.rpc("submit_receipt", { p_actor: users.sales.id, p_payload: {}, p_require_proofs: false })).error).not.toBeNull();
    const del = await sales.from("receipts").delete().like("receipt_no", `${PREFIX}%`).select();
    expect(del.data ?? []).toEqual([]);
  });

  it("a proof goes into your own folder only", async () => {
    const sales = await signedIn("sales");
    const file = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });
    expect((await sales.storage.from("payment-proofs").upload(`${users.sales.id}/p.jpg`, file, { contentType: "image/jpeg" })).error).toBeNull();
    expect((await sales.storage.from("payment-proofs").upload(`${users.admin.id}/p.jpg`, file, { contentType: "image/jpeg" })).error).not.toBeNull();
  });
});
