import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

// The sold list on the project's real migrations (migration 45).
let db: Db;
const one = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows[0];
beforeAll(async () => { db = await createDb(); }, 60_000);

describe("a transfer is the record of a sale", () => {
  it("has the sale, the route, the stage and the places of the papers, with sensible defaults", async () => {
    await db.query("insert into public.car_sales (plate_no, buyer) values ('AAA1111', 'JUAN')");
    const t = await one<Record<string, unknown>>("select route, stage, is_reference, flags, edited_in_app, sold_on, agreed_price from public.car_sales where plate_no = 'AAA1111'");
    expect(t).toMatchObject({ route: "unknown", stage: "in_process", is_reference: false, flags: [], edited_in_app: false, sold_on: null, agreed_price: null });
  });
  it("refuses a made-up stage or route, and a negative price", async () => {
    await expect(db.query("insert into public.car_sales (plate_no, stage) values ('AAA2222', 'lost')")).rejects.toThrow();
    await expect(db.query("insert into public.car_sales (plate_no, route) values ('AAA2223', 'bike')")).rejects.toThrow();
    await expect(db.query("insert into public.car_sales (plate_no, agreed_price) values ('AAA2224', -1)")).rejects.toThrow();
  });
  it("makes the import safe to run twice: a source key is used once", async () => {
    await db.query("insert into public.car_sales (plate_no, source_key) values ('AAA3333', 'k1')");
    await expect(db.query("insert into public.car_sales (plate_no, source_key) values ('AAA3333', 'k1')")).rejects.toThrow();
    await db.query("insert into public.car_sales (plate_no) values ('AAA3334'), ('AAA3334')"); // records without a key can repeat (a plate sold twice)
  });
});

describe("the car record", () => {
  it("keeps the chassis and engine numbers, and the current-car view shows them", async () => {
    await db.query("insert into public.docs_units (plate_no, plate_display, chassis_no, engine_no) values ('BBB1111', 'BBB 1111', 'MRHFC6630JT021559', 'R18Z1')");
    expect(await one("select chassis_no, engine_no from public.docs_units_current where plate_no = 'BBB1111'")).toEqual({ chassis_no: "MRHFC6630JT021559", engine_no: "R18Z1" });
  });
  it("still links a waiting transfer to a new car by plate", async () => {
    await db.query("insert into public.car_sales (plate_no) values ('CCC1111')");
    await db.query("insert into public.docs_units (plate_no, plate_display) values ('CCC1111', 'CCC 1111')");
    expect((await one<{ unit_id: string | null }>("select unit_id from public.car_sales where plate_no = 'CCC1111'")).unit_id).not.toBeNull();
  });
});

describe("the review list can hold a sold list row without a plate (migration 46)", () => {
  it("accepts the new kind with its row, once per row", async () => {
    const payload = JSON.stringify({ rowKey: "sold|transfer tab|112", fields: {} });
    await db.query("insert into public.docs_review_items (kind, message, payload) values ('sold_no_plate', 'row 112', $1::jsonb)", [payload]);
    await expect(db.query("insert into public.docs_review_items (kind, message, payload) values ('sold_no_plate', 'row 112 again', $1::jsonb)", [payload])).rejects.toThrow();
    await db.query("insert into public.docs_review_items (kind, message) values ('no_plate', 'a row of the old register'), ('no_plate', 'another')"); // items without a row can repeat
    await expect(db.query("insert into public.docs_review_items (kind, message) values ('weird', 'x')")).rejects.toThrow();
  });
});

describe("a sale made in the app (migration 47)", () => {
  const user = async (role: string, email: string) => {
    const id = (await db.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [email])).rows[0].id;
    await db.query("update public.profiles set role = $2 where id = $1", [id, role]);
    return id;
  };
  it("can be cancelled, and deleting its deal deletes the record the deal made but only unlinks an older one", async () => {
    const admin = await user("admin", "a47@example.test"), sales = await user("sales", "s47@example.test");
    const payload = { receipt_no: "D47-1", receipt_date: "2026-11-05", kind: "partial", buyer: { name: "Test Buyer" }, units: [{ make_type: "2023 Toyota Vios", plate: "ZZT 4701" }], price: "500000", sale_type: "cash", due: { mode: "text", text: "soon" }, payments: [{ method: "cash", amount: "100000" }] };
    const r = (await db.query<{ r: { deal_id: string } }>("select public.submit_receipt($1, $2::jsonb, false) as r", [sales, JSON.stringify(payload)])).rows[0].r;
    await db.query("insert into public.car_sales (plate_no, buyer, deal_id, source, source_key, stage) values ('ZZT4701', 'TEST BUYER', $1, 'app', $2, 'cancelled')", [r.deal_id, `deal|${r.deal_id}|ZZT4701`]);   // made by the deal; the stage can be cancelled
    await db.query("insert into public.car_sales (plate_no, buyer, deal_id, source, source_key) values ('ZZT4701', 'OLDER BUYER', $1, 'import', 'ft|ZZT4701|2026-01-01|OLDERBUYER')", [r.deal_id]);   // an older record, joined to the deal
    await db.query("select public.delete_deal($1, $2)", [admin, r.deal_id]);
    const left = (await db.query<{ buyer: string; deal_id: string | null }>("select buyer, deal_id from public.car_sales where plate_no = 'ZZT4701'")).rows;
    expect(left).toEqual([{ buyer: "OLDER BUYER", deal_id: null }]);
  });
  it("lets a Super Admin delete a transaction as well as an Admin (the rename of the table must not bring the old Admin-only check back)", async () => {
    const boss = await user("super_admin", "boss47@example.test"), sales = await user("sales", "s47b@example.test");
    const payload = { receipt_no: "D47-2", receipt_date: "2026-11-05", kind: "partial", buyer: { name: "Boss Test" }, units: [{ make_type: "2023 Toyota Vios", plate: "ZZT 4702" }], price: "500000", sale_type: "cash", due: { mode: "text", text: "soon" }, payments: [{ method: "cash", amount: "100000" }] };
    const r = (await db.query<{ r: { deal_id: string } }>("select public.submit_receipt($1, $2::jsonb, false) as r", [sales, JSON.stringify(payload)])).rows[0].r;
    await expect(db.query("select public.delete_deal($1, $2)", [boss, r.deal_id])).resolves.toBeTruthy();
  });
});

describe("the handoff lives on the sale record only (migrations 48 and 59)", () => {
  it("keeps the steps of the originals on the sale record and none on the workflow row", async () => {
    const cols = async (t: string) => (await db.query<{ column_name: string }>(`select column_name from information_schema.columns where table_schema = 'public' and table_name = '${t}' and column_name like '%handoff%' or column_name like 'handed_off%' and table_name = '${t}'`)).rows.length;
    expect((await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'unit_workflow' and column_name like 'handoff%'")).rows).toEqual([]);
    expect(await cols("car_sales")).toBeGreaterThan(0);
    await db.query("insert into public.car_sales (plate_no, handed_off_at, handoff_note, handoff_checked) values ('HND1111', '2026-06-01T01:00:00Z', 'with the CR', array['or'])");
    expect((await one<{ handoff_note: string }>("select handoff_note from public.car_sales where plate_no = 'HND1111'")).handoff_note).toBe("with the CR");
  });
});


describe("the price list copies are gone (migration 53)", () => {
  it("has no list_* copy on the car record, and the current-car view still works", async () => {
    const cols = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'docs_units' and column_name like 'list\\_%'")).rows.map((r) => r.column_name);
    expect(cols).toEqual(["list_price"]);
    await db.query("insert into public.docs_units (plate_no, plate_display, list_price) values ('DDD1111', 'DDD 1111', 100000)");
    expect((await one<{ list_price: string }>("select list_price from public.docs_units_current where plate_no = 'DDD1111'")).list_price).toBeTruthy();
  });
  it("keeps a place for the values that were dropped", async () => {
    await db.query("insert into public.car_dropped_values (plate_no, column_name, value, reason) values ('DDD1111', 'list_color', 'WHITE PEARL', 'test')");
    expect((await one<{ n: string }>("select count(*)::int as n from public.car_dropped_values")).n).toBe(1);
  });
});

describe("one status per car (migration 54)", () => {
  it("has the state and not the two old status columns, and a new car starts Onhand", async () => {
    const cols = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'docs_units' and column_name in ('sale_status', 'vehicle_status', 'stock_state')")).rows.map((r) => r.column_name);
    expect(cols).toEqual(["stock_state"]);
    await db.query("insert into public.docs_units (plate_no, plate_display) values ('EEE1111', 'EEE 1111')");
    expect((await one<{ stock_state: string }>("select stock_state from public.docs_units_current where plate_no = 'EEE1111'")).stock_state).toBe("Onhand");
  });
  it("forgets who and when for a car that is neither reserved nor sold", async () => {
    await db.query("update public.docs_units set stock_state = 'Reserved', state_for = 'ELLA', state_on = '2026-11-20' where plate_no = 'EEE1111'");
    await db.query("update public.docs_units set stock_state = 'Onhand' where plate_no = 'EEE1111'");
    expect(await one("select state_for, state_on from public.docs_units where plate_no = 'EEE1111'")).toEqual({ state_for: null, state_on: null });
  });
});

describe("one OR expiry date (migration 55)", () => {
  it("has the date and not the two old text columns, and a typed date is kept as a date", async () => {
    const cols = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'docs_units' and column_name in ('renewal', 'or_expiry_raw', 'or_expiry')")).rows.map((r) => r.column_name);
    expect(cols).toEqual(["or_expiry"]);
    await db.query("insert into public.docs_units (plate_no, plate_display, or_expiry) values ('FFF1111', 'FFF 1111', '2027-09-01')");
    expect((await one<{ or_expiry: Date }>("select or_expiry from public.docs_units_current where plate_no = 'FFF1111'")).or_expiry).toBeTruthy();
  });
});

describe("the old sale list copy is gone (migration 56)", () => {
  it("has no car_stock table", async () => {
    expect((await one<{ n: number }>("select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = 'car_stock'")).n).toBe(0);
  });
});

describe("one note on the car (migrations 57 and 58)", () => {
  it("has remarks and not the two old note columns, and the current-car view shows it", async () => {
    const cols = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'docs_units' and column_name in ('remarks', 'remarks_1', 'remarks_2') order by column_name")).rows.map((r) => r.column_name);
    expect(cols).toEqual(["remarks"]);
    await db.query("insert into public.docs_units (plate_no, plate_display, remarks) values ('GGG1111', 'GGG 1111', 'ORIG DOCS AT JEP')");
    expect((await one<{ remarks: string }>("select remarks from public.docs_units_current where plate_no = 'GGG1111'")).remarks).toBe("ORIG DOCS AT JEP");
  });
});
