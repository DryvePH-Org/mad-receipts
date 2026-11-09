import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

let db: Db;
beforeAll(async () => { db = await createDb(); }, 60_000);

describe("transmittals table", () => {
  it("keeps one row per plate, updated in place", async () => {
    await db.query("insert into public.transmittals (plate_no, data) values ('NKP5459', '{\"note\":\"a\"}')");
    await db.query("insert into public.transmittals (plate_no, data) values ('NKP5459', '{\"note\":\"b\"}') on conflict (plate_no) do update set data = excluded.data");
    const rows = (await db.query<{ data: { note: string } }>("select data from public.transmittals")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].data.note).toBe("b");
  });
  it("only accepts plates written without spaces or dashes, in capitals", async () => {
    await expect(db.query("insert into public.transmittals (plate_no) values ('nkp 5459')")).rejects.toThrow();
    await expect(db.query("insert into public.transmittals (plate_no) values ('NKP-5459')")).rejects.toThrow();
  });
  it("has row-level security on", async () => {
    expect((await db.query<{ r: boolean }>("select relrowsecurity as r from pg_class where relname = 'transmittals'")).rows[0].r).toBe(true);
  });
});
