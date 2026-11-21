import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

// The sold list on the project's real migrations (migration 45).
let db: Db;
const one = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows[0];
beforeAll(async () => { db = await createDb(); }, 60_000);

describe("a transfer is the record of a sale", () => {
  it("has the sale, the route, the stage and the places of the papers, with sensible defaults", async () => {
    await db.query("insert into public.car_transfers (plate_no, buyer) values ('AAA1111', 'JUAN')");
    const t = await one<Record<string, unknown>>("select route, stage, is_reference, flags, edited_in_app, sold_on, agreed_price from public.car_transfers where plate_no = 'AAA1111'");
    expect(t).toMatchObject({ route: "unknown", stage: "in_process", is_reference: false, flags: [], edited_in_app: false, sold_on: null, agreed_price: null });
  });
  it("refuses a made-up stage or route, and a negative price", async () => {
    await expect(db.query("insert into public.car_transfers (plate_no, stage) values ('AAA2222', 'lost')")).rejects.toThrow();
    await expect(db.query("insert into public.car_transfers (plate_no, route) values ('AAA2223', 'bike')")).rejects.toThrow();
    await expect(db.query("insert into public.car_transfers (plate_no, agreed_price) values ('AAA2224', -1)")).rejects.toThrow();
  });
  it("makes the import safe to run twice: a source key is used once", async () => {
    await db.query("insert into public.car_transfers (plate_no, source_key) values ('AAA3333', 'k1')");
    await expect(db.query("insert into public.car_transfers (plate_no, source_key) values ('AAA3333', 'k1')")).rejects.toThrow();
    await db.query("insert into public.car_transfers (plate_no) values ('AAA3334'), ('AAA3334')"); // records without a key can repeat (a plate sold twice)
  });
});

describe("the car record", () => {
  it("keeps the chassis and engine numbers, and the current-car view shows them", async () => {
    await db.query("insert into public.docs_units (plate_no, plate_display, chassis_no, engine_no) values ('BBB1111', 'BBB 1111', 'MRHFC6630JT021559', 'R18Z1')");
    expect(await one("select chassis_no, engine_no from public.docs_units_current where plate_no = 'BBB1111'")).toEqual({ chassis_no: "MRHFC6630JT021559", engine_no: "R18Z1" });
  });
  it("still links a waiting transfer to a new car by plate", async () => {
    await db.query("insert into public.car_transfers (plate_no) values ('CCC1111')");
    await db.query("insert into public.docs_units (plate_no, plate_display) values ('CCC1111', 'CCC 1111')");
    expect((await one<{ unit_id: string | null }>("select unit_id from public.car_transfers where plate_no = 'CCC1111'")).unit_id).not.toBeNull();
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
    await db.query("insert into public.car_transfers (plate_no, buyer, deal_id, source, source_key, stage) values ('ZZT4701', 'TEST BUYER', $1, 'app', $2, 'cancelled')", [r.deal_id, `deal|${r.deal_id}|ZZT4701`]);   // made by the deal; the stage can be cancelled
    await db.query("insert into public.car_transfers (plate_no, buyer, deal_id, source, source_key) values ('ZZT4701', 'OLDER BUYER', $1, 'import', 'ft|ZZT4701|2026-01-01|OLDERBUYER')", [r.deal_id]);   // an older record, joined to the deal
    await db.query("select public.delete_deal($1, $2)", [admin, r.deal_id]);
    const left = (await db.query<{ buyer: string; deal_id: string | null }>("select buyer, deal_id from public.car_transfers where plate_no = 'ZZT4701'")).rows;
    expect(left).toEqual([{ buyer: "OLDER BUYER", deal_id: null }]);
  });
});

describe("the handoff moves onto the transfer (migration 48)", () => {
  it("copies a handoff onto the latest sale of the plate, or makes a record, and does not copy twice", async () => {
    await db.query("insert into public.car_transfers (plate_no, buyer, sold_on, stage) values ('HND1111', 'OLD', '2025-01-01', 'unknown'), ('HND1111', 'NEW', '2026-05-05', 'unknown')");
    await db.query("insert into public.unit_workflow (plate_no, handoff_at, handoff_note, handoff_checked) values ('HND1111', '2026-06-01T01:00:00Z', 'with the CR', array['or'])");
    await db.query("insert into public.unit_workflow (plate_no, handoff_at, handoff_returned_at) values ('HND2222', '2026-06-02T01:00:00Z', '2026-06-20T01:00:00Z')");
    expect((await one<{ n: number }>("select public.move_handoffs_to_transfers() as n")).n).toBe(2);
    const a = await one<Record<string, unknown>>("select buyer, stage, handoff_note, handoff_checked, back_at from public.car_transfers where plate_no = 'HND1111' and handed_off_at is not null");
    expect([a.buyer, a.stage, a.handoff_note, a.handoff_checked, a.back_at]).toEqual(["NEW", "in_process", "with the CR", ["or"], null]); // the latest sale, still out
    const b = await one<Record<string, unknown>>("select stage, source, back_at is not null as back from public.car_transfers where plate_no = 'HND2222'");
    expect(b).toEqual({ stage: "transferred", source: "app", back: true });                                                                  // no record yet: one is made, and the papers are back
    expect((await one<{ n: number }>("select public.move_handoffs_to_transfers() as n")).n).toBe(0);
    expect((await one<{ n: string }>("select count(*)::text as n from public.car_transfers where plate_no = 'HND1111'")).n).toBe("2");
  });
});

