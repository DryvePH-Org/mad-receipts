import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

let db: Db;
beforeAll(async () => { db = await createDb(); }, 60_000);

describe("unit details and workflow tables", () => {
  it("keep one row per plate and only accept plates in capitals without spaces", async () => {
    await db.query("insert into public.unit_workflow (plate_no, docs_approved_at) values ('NKP5459', now())");
    await db.query("insert into public.unit_workflow (plate_no, docs_approved_at) values ('NKP5459', now()) on conflict (plate_no) do update set docs_approved_at = excluded.docs_approved_at");
    expect((await db.query("select * from public.unit_workflow")).rows).toHaveLength(1);
    await expect(db.query("insert into public.unit_workflow (plate_no) values ('nkp 5459')")).rejects.toThrow();
  });
  it("have row-level security on, closed to the browser", async () => {
    for (const t of ["unit_workflow"]) expect((await db.query<{ r: boolean }>(`select relrowsecurity as r from pg_class where relname = '${t}'`)).rows[0].r).toBe(true);
  });
});
