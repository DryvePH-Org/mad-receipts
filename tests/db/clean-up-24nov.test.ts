import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDb } from "./harness";

// The owner's real order: the database as it is today (migrations up to 52), then the file run before the push, then the file run after it.
describe("the 24 Nov clean-up files, applied in the owner's order on a database with data", () => {
  it("keeps every value that matters and removes the old columns", async () => {
    const db = await createDb({ upTo: "20261124000052_zzz" });
    await db.query(`insert into public.docs_units (plate_no, plate_display, make, color, list_color, list_model, sale_status, vehicle_status, renewal, remarks_1, remarks_2)
      values ('AAA1111', 'AAA 1111', 'TOYOTA', 'WHITE', 'WHITE PEARL', 'VIOS E', 'Sold', 'SOLD', '09/01/2027', 'ORIG DOCS AT JEP', 'second note')`);
    await db.query("insert into public.docs_units (plate_no, plate_display, renewal) values ('BBB2222', 'BBB 2222', 'not a date')");
    await db.exec(readFileSync("Docs/apply-24nov-1-before-push.sql", "utf8"));
    await db.exec(readFileSync("Docs/apply-24nov-2-after-push.sql", "utf8"));

    const car = (await db.query<Record<string, unknown>>("select plate_no, stock_state, or_expiry::text as or_expiry, remarks, color from public.docs_units_current where plate_no = 'AAA1111'")).rows[0];
    expect(car).toEqual({ plate_no: "AAA1111", stock_state: "Sold", or_expiry: "2027-09-01", remarks: "ORIG DOCS AT JEP\n\nsecond note", color: "WHITE" });
    const kept = (await db.query<{ plate_no: string; column_name: string; value: string }>("select plate_no, column_name, value from public.car_dropped_values order by plate_no, column_name")).rows;
    expect(kept).toEqual(expect.arrayContaining([
      { plate_no: "AAA1111", column_name: "list_color", value: "WHITE PEARL" }, { plate_no: "AAA1111", column_name: "list_model", value: "VIOS E" },
      { plate_no: "AAA1111", column_name: "sale_status", value: "Sold" }, { plate_no: "AAA1111", column_name: "remarks_1", value: "ORIG DOCS AT JEP" },
      { plate_no: "BBB2222", column_name: "renewal", value: "not a date" },
    ]));
    const cols = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'docs_units'")).rows.map((r) => r.column_name);
    for (const gone of ["list_color", "list_model", "sale_status", "vehicle_status", "renewal", "or_expiry_raw", "remarks_1", "remarks_2"]) expect(cols).not.toContain(gone);
    expect((await db.query("select 1 from information_schema.tables where table_name = 'car_stock'")).rows).toHaveLength(0);
  }, 90_000);
});

describe("the sale record rename (migrations 60 and 61), in the owner's order", () => {
  it("keeps the rows, keeps the old name working until the view is removed, and links a waiting sale to a new car", async () => {
    const db = await createDb({ upTo: "20261124000059_zzz" });
    await db.query("insert into public.car_transfers (plate_no, buyer, sold_on, stage) values ('SAL1111', 'JUAN', '2026-05-05', 'in_process')");
    await db.exec(readFileSync("supabase/migrations/20261124000060_car_sales.sql", "utf8"));
    expect((await db.query("select buyer from public.car_sales where plate_no = 'SAL1111'")).rows).toEqual([{ buyer: "JUAN" }]);
    await db.query("insert into public.car_transfers (plate_no, buyer) values ('SAL2222', 'OLD CODE')"); // the code that is still running says the old name
    expect((await db.query("select buyer from public.car_sales where plate_no = 'SAL2222'")).rows).toEqual([{ buyer: "OLD CODE" }]);
    await db.query("insert into public.docs_units (plate_no, plate_display) values ('SAL1111', 'SAL 1111')");
    expect((await db.query<{ unit_id: string | null }>("select unit_id from public.car_sales where plate_no = 'SAL1111'")).rows[0].unit_id).not.toBeNull();
    const names = (await db.query<{ n: string }>("select conname as n from pg_constraint where conrelid = 'public.car_sales'::regclass and conname like 'car\\_transfers%'")).rows;
    expect(names).toEqual([]);
    await db.exec(readFileSync("supabase/migrations/20261124000061_drop_car_transfers_view.sql", "utf8"));
    expect((await db.query("select 1 from information_schema.views where table_name = 'car_transfers'")).rows).toHaveLength(0);
  }, 90_000);
});
