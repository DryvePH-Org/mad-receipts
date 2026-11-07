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
