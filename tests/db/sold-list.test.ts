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

