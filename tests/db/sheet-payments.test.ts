import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

let db: Db;
beforeAll(async () => { db = await createDb(); }, 60_000);

describe("the copy of the payments sheet (migration 78)", () => {
  it("keeps one row for each row of a tab, and one for each stage of a sale row", async () => {
    await db.query("insert into public.sheet_bank_lines (tab, row_no, account, line_date, credit) values ('T', 3, 'BDO 3321', '2026-11-03', 20000)");
    await expect(db.query("insert into public.sheet_bank_lines (tab, row_no, account, line_date) values ('T', 3, 'BDO 3321', '2026-11-04')")).rejects.toThrow();
    await db.query("insert into public.sheet_sale_payments (tab, row_no, stage, amount) values ('S', 3, 'reservation', 20000), ('S', 3, 'full', 70000)");
    await expect(db.query("insert into public.sheet_sale_payments (tab, row_no, stage, amount) values ('S', 3, 'reservation', 1)")).rejects.toThrow();
    await expect(db.query("insert into public.sheet_sale_payments (tab, row_no, stage, amount) values ('S', 4, 'bonus', 1)")).rejects.toThrow();
  });
  it("tracks each tab's copy", async () => {
    await db.query("insert into public.sheet_sync_tabs (tab, kind, rows_copied, synced_at) values ('T', 'bank', 5, now())");
    await expect(db.query("insert into public.sheet_sync_tabs (tab, kind) values ('U', 'other')")).rejects.toThrow();
  });
});

describe("sale payments from the sheet (migration 79)", () => {
  it("a sale record can come from the sheet, and its payments go when it goes", async () => {
    await db.query("insert into public.car_sales (plate_no, buyer, source, source_key) values ('NKH7462', 'JUAN', 'sheet', 'sheet|T|NKH7462')");
    const { rows } = await db.query<{ id: string }>("select id from public.car_sales where plate_no = 'NKH7462'");
    await db.query("insert into public.car_sale_payments (sale_id, plate_no, stage, amount, source_tab, source_row) values ($1, 'NKH7462', 'reservation', 20000, 'T', 3)", [rows[0].id]);
    await expect(db.query("insert into public.car_sale_payments (sale_id, plate_no, stage, amount, source_tab, source_row) values ($1, 'NKH7462', 'reservation', 1, 'T', 3)", [rows[0].id])).rejects.toThrow();
    await expect(db.query("insert into public.car_sale_payments (sale_id, plate_no, stage, amount, source_tab, source_row) values ($1, 'NKH7462', 'bonus', 1, 'T', 4)", [rows[0].id])).rejects.toThrow();
    await db.query("delete from public.car_sales where id = $1", [rows[0].id]);
    expect((await db.query("select 1 from public.car_sale_payments")).rows.length).toBe(0);
  });
});
