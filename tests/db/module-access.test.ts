import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

// Per-person module access columns, on the project's real migrations.
let db: Db;
let id: string;
beforeAll(async () => {
  db = await createDb();
  id = (await db.query<{ id: string }>("insert into auth.users (email) values ('m@example.test') returning id")).rows[0].id;
}, 60_000);

describe("module access columns", () => {
  it("start empty for every account", async () => {
    expect((await db.query("select module_grants, module_denies from public.profiles where id = $1", [id])).rows[0]).toEqual({ module_grants: [], module_denies: [] });
  });
  it("accept real modules and refuse made-up ones", async () => {
    await db.query("update public.profiles set module_grants = array['dashboard'], module_denies = array['reminders'] where id = $1", [id]);
    await expect(db.query("update public.profiles set module_grants = array['nothing'] where id = $1", [id])).rejects.toThrow();
    await expect(db.query("update public.profiles set module_denies = array['dashboard','x'] where id = $1", [id])).rejects.toThrow();
  });
});

describe("reset_deal_numbers (Settings → Delete all transactions)", () => {
  it("refuses while any deal exists, and restarts the numbers at D1001 once there are none", async () => {
    const payload = {
      receipt_no: "D-RESET-1", receipt_date: "2026-11-07", kind: "partial", buyer: { name: "Test Buyer" },
      units: [{ make_type: "2023 Toyota Vios", plate: "ZZT 9001" }], price: "500000", sale_type: "cash", due: { mode: "text", text: "soon" },
      payments: [{ method: "cash", amount: "100000" }],
    };
    await db.query("select public.submit_receipt($1, $2::jsonb, false)", [id, JSON.stringify(payload)]);
    expect(Number((await db.query<{ n: string }>("select count(*)::text as n from public.deals")).rows[0].n)).toBe(1);
    await expect(db.query("select public.reset_deal_numbers()")).rejects.toThrow(/deals_exist/);
    // what the app does: receipts and jobs first, then the deals
    await db.query("delete from public.sync_jobs");
    await db.query("delete from public.receipts");
    await db.query("delete from public.deals");
    await db.query("select public.reset_deal_numbers()");
    const next = await db.query<{ deal_no: string }>("select (select 'D' || nextval('public.deal_no_seq')) as deal_no");
    expect(next.rows[0].deal_no).toBe("D1001");
  });
});

describe("approving and settings follow a person's modules (migration 21)", () => {
  const person = async (email: string, role: string, grants: string[] = [], denies: string[] = []) => {
    const pid = (await db.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [email])).rows[0].id;
    await db.query("update public.profiles set role = $2, module_grants = $3, module_denies = $4 where id = $1", [pid, role, grants, denies]);
    return pid;
  };
  const can = async (pid: string, mod: string) => (await db.query<{ ok: boolean }>("select public.can_use_module($1, $2) as ok", [pid, mod])).rows[0].ok;

  it("the Approver role approves, a granted person approves, a hidden or ordinary one does not", async () => {
    expect(await can(await person("ap@x.test", "approver"), "approvals")).toBe(true);
    expect(await can(await person("gr@x.test", "sales", ["approvals"]), "approvals")).toBe(true);
    expect(await can(await person("sa@x.test", "sales"), "approvals")).toBe(false);
    expect(await can(await person("hid@x.test", "approver", [], ["approvals"]), "approvals")).toBe(false);
    expect(await can(await person("hg@x.test", "sales", ["approvals"], ["approvals"]), "approvals")).toBe(false); // hiding wins
  });
  it("an Admin always has settings; others only when granted", async () => {
    expect(await can(await person("ad@x.test", "admin", [], ["settings"]), "settings")).toBe(true);
    expect(await can(await person("st@x.test", "sales", ["settings"]), "settings")).toBe(true);
    expect(await can(await person("no@x.test", "approver"), "settings")).toBe(false);
  });
  it("review_receipt refuses someone without the module, and still refuses your own receipt", async () => {
    const sales = await person("s2@x.test", "sales");
    const granted = await person("g2@x.test", "sales", ["approvals"]);
    const plain = await person("p2@x.test", "documentation");
    const payload = { receipt_no: "D-MOD-1", receipt_date: "2026-11-07", kind: "partial", buyer: { name: "Test Buyer" }, units: [{ make_type: "2023 Toyota Vios", plate: "ZZT 9101" }], price: "500000", sale_type: "cash", due: { mode: "text", text: "soon" }, payments: [{ method: "cash", amount: "100000" }] };
    const r = (await db.query<{ r: { receipt_id: string } }>("select public.submit_receipt($1, $2::jsonb, false) as r", [sales, JSON.stringify(payload)])).rows[0].r;
    await expect(db.query("select public.review_receipt($1, $2, true)", [plain, r.receipt_id])).rejects.toThrow(/not_approver/);
    await expect(db.query("select public.review_receipt($1, $2, true)", [sales, r.receipt_id])).rejects.toThrow(/not_approver/);
    await db.query("select public.review_receipt($1, $2, true)", [granted, r.receipt_id]); // the granted person can
    expect((await db.query<{ status: string }>("select status from public.receipts where id = $1", [r.receipt_id])).rows[0].status).toBe("approved");
    const own = (await db.query<{ r: { receipt_id: string } }>("select public.submit_receipt($1, $2::jsonb, false) as r", [granted, JSON.stringify({ ...payload, receipt_no: "D-MOD-2", units: [{ make_type: "2023 Toyota Vios", plate: "ZZT 9102" }] })])).rows[0].r;
    await expect(db.query("select public.review_receipt($1, $2, true)", [granted, own.receipt_id])).rejects.toThrow(/own_receipt/);
  });
});
