import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

// PCF (petty cash) inside MAD, on the project's real migrations: who counts as which petty cash role,
// and that MAD's own rules on profiles still hold.
let db: Db;
const ids: Record<string, string> = {};

async function as<T>(id: string, sql: string, params?: unknown[]) {
  try {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
    return await db.query<T>(sql, params);
  } finally {
    await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);");
  }
}

beforeAll(async () => {
  db = await createDb();
  for (const [name, role, pcf] of [
    ["sales", "sales", null],
    ["admin", "admin", null],
    ["adminCustodian", "admin", "custodian"],
    ["custodian", "sales", "custodian"],
    ["accounting", "approver", "accounting"],
  ] as const) {
    ids[name] = (await db.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [`${name}@example.test`])).rows[0].id;
    await db.query("update public.profiles set role = $2, pcf_role = $3 where id = $1", [ids[name], role, pcf]);
  }
}, 60_000);

const appRole = async (id: string) => (await as<{ r: string | null }>(id, "select public.app_role() as r")).rows[0].r;

describe("petty cash role", () => {
  it("is the petty cash role, or admin for a MAD Admin without one, or nothing", async () => {
    expect(await appRole(ids.sales)).toBeNull();
    expect(await appRole(ids.admin)).toBe("admin");
    expect(await appRole(ids.adminCustodian)).toBe("custodian");
    expect(await appRole(ids.custodian)).toBe("custodian");
    expect(await appRole(ids.accounting)).toBe("accounting");
  });

  it("is switched off with the account", async () => {
    await db.query("update public.profiles set is_active = false where id = $1", [ids.custodian]);
    expect(await appRole(ids.custodian)).toBeNull();
    await db.query("update public.profiles set is_active = true where id = $1", [ids.custodian]);
  });

  it("keeps someone without petty cash out of the petty cash actions", async () => {
    await expect(as(ids.sales, "select public.record_cash_count(gen_random_uuid(), 1, null)")).rejects.toThrow();
  });

  it("assigns funds only to someone whose petty cash role is custodian", async () => {
    const fund = (await db.query<{ id: string }>("insert into public.funds (name, amount, per_txn_limit) values ('Test fund', 1000, 100) returning id")).rows[0].id;
    await expect(as(ids.admin, "select public.assign_custodian_funds($1, array[$2]::uuid[])", [ids.sales, fund])).rejects.toThrow(/active custodian/);
    await as(ids.admin, "select public.assign_custodian_funds($1, array[$2]::uuid[])", [ids.custodian, fund]);
    expect((await db.query("select custodian_id from public.fund_custodians where fund_id = $1", [fund])).rows).toEqual([{ custodian_id: ids.custodian }]);
  });

  it("leaves profiles read-only to signed-in users, as MAD had it", async () => {
    await expect(as(ids.admin, "update public.profiles set pcf_role = 'admin' where id = $1", [ids.sales])).rejects.toThrow();
    expect((await as<{ n: number }>(ids.sales, "select count(*)::int as n from public.profiles")).rows[0].n).toBe(5);
  });

  it("accepts the petty cash modules in per-person access", async () => {
    await db.query("update public.profiles set module_denies = array['pcf-cash-count','reminders'] where id = $1", [ids.custodian]);
    await expect(db.query("update public.profiles set module_denies = array['pcf-nothing'] where id = $1", [ids.custodian])).rejects.toThrow();
  });
});
