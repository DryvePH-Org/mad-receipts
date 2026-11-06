import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

// The Documentation role and the car-documents tables, on the project's real migrations.
let db: Db;
let sales: string, docs: string;
let n = 0;
const user = async (email: string, role: string) => {
  const id = (await db.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [email])).rows[0].id;
  await db.query("update public.profiles set role = $2 where id = $1", [id, role]);
  return id;
};
const submit = async (payload: Record<string, unknown>) =>
  (await db.query<{ r: Record<string, string> }>("select public.submit_receipt($1, $2::jsonb, false) as r", [sales, JSON.stringify(payload)])).rows[0].r;
const newDeal = (plate: string) => ({
  receipt_no: `D-${++n}`, receipt_date: "2026-11-05", kind: "partial", buyer: { name: "Test Buyer" },
  units: [{ make_type: "2023 Toyota Vios", plate }], price: "500000", sale_type: "cash", due: { mode: "text", text: "soon" },
  payments: [{ method: "cash", amount: "100000" }],
});
const jobs = async (receiptId: string) => (await db.query<{ target: string; event: string }>("select target, event from public.sync_jobs where receipt_id = $1 order by target", [receiptId])).rows;

beforeAll(async () => {
  db = await createDb();
  sales = await user("sales@example.test", "sales");
  docs = await user("docs@example.test", "documentation");
}, 60_000);

describe("the Documentation role", () => {
  it("is a valid role, and unknown roles are still refused", async () => {
    expect((await db.query<{ role: string }>("select role from public.profiles where id = $1", [docs])).rows[0].role).toBe("documentation");
    await expect(db.query("update public.profiles set role = 'janitor' where id = $1", [docs])).rejects.toThrow();
  });
});

describe("linking a car folder when an AR is created", () => {
  it("queues one docs job for the first receipt of a deal, approved or not", async () => {
    const r = await submit(newDeal("AAX 3622"));
    expect(await jobs(r.receipt_id)).toEqual([{ target: "docs", event: "submit" }]);
  });
  it("does not queue another for the next receipt of the same deal", async () => {
    const first = await submit(newDeal("NDS 1331"));
    const next = await submit({ deal_id: first.deal_id, receipt_no: `D-${++n}`, receipt_date: "2026-11-06", kind: "partial", payments: [{ method: "cash", amount: "50000" }] });
    expect(await jobs(next.receipt_id)).toEqual([]);
  });
});

describe("the car-documents tables", () => {
  it("are readable by anyone signed in and writable by no one but the server", async () => {
    await db.query(`insert into public.unit_folders (plate_no, plate_display, folder_id, folder_name) values ('AAX3622', 'AAX-3622', 'f1', '14 Toyota Vios (AAX-3622)')`);
    const as = async (id: string, sql: string): Promise<{ rows: Record<string, unknown>[] }> => {
      await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
      try { return (await db.query(sql)) as { rows: Record<string, unknown>[] }; } finally { await db.exec("reset role;"); }
    };
    expect((await as(docs, "select count(*)::int as n from public.unit_folders")).rows[0]).toEqual({ n: 1 });
    await expect(as(docs, "insert into public.unit_folders (plate_no, plate_display) values ('ZZZ1', 'ZZZ1')")).rejects.toThrow();
    await expect(as(docs, "update public.unit_folders set case_type = 'clean'")).rejects.toThrow(/permission denied/); // signed-in people may only read
    expect((await db.query<{ case_type: string | null }>("select case_type from public.unit_folders where plate_no = 'AAX3622'")).rows[0].case_type).toBeNull();
  });
  it("are locked down to reading: the signed-out role can do nothing and signed-in people can only read", async () => {
    await db.query(`insert into public.unit_folders (plate_no, plate_display, folder_id, folder_name) values ('LOCK001', 'LOCK-001', 'f2', 'lock folder')`);
    await db.query(`insert into public.folder_files (plate_no, drive_file_id, filename) values ('LOCK001', 'lock-file', 'IMG_2.HEIC')`);
    const run = async (role: string, id: string | null, sql: string) => {
      await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${id ?? ""}', false);`);
      try { return await db.query(sql); } finally { await db.exec("reset role;"); }
    };
    for (const table of ["unit_folders", "folder_files"]) {
      // the signed-out role: nothing at all, not even reading
      for (const sql of [`select * from public.${table}`, `delete from public.${table}`, `truncate public.${table}`])
        await expect(run("anon", null, sql), `anon: ${sql}`).rejects.toThrow(/permission denied/);
      // signed-in people: reading only
      expect((await run("authenticated", docs, `select count(*)::int as n from public.${table}`)).rows[0]).toMatchObject({ n: expect.any(Number) });
      for (const sql of [`delete from public.${table}`, `truncate public.${table}`])
        await expect(run("authenticated", docs, sql), `signed in: ${sql}`).rejects.toThrow(/permission denied/);
    }
    await expect(run("anon", null, "insert into public.unit_folders (plate_no, plate_display) values ('ZZ1', 'ZZ1')")).rejects.toThrow(/permission denied/);
    await expect(run("authenticated", docs, "insert into public.folder_files (plate_no, drive_file_id, filename) values ('LOCK001', 'x', 'x')")).rejects.toThrow(/permission denied/);
    await expect(run("authenticated", docs, "update public.folder_files set read_status = 'done'")).rejects.toThrow(/permission denied/);
    await db.query(`delete from public.unit_folders where plate_no = 'LOCK001'`);
  });
  it("show exactly these permissions in the catalog: signed-out none, signed-in select only, the server everything", async () => {
    const perms = async (table: string, role: string) =>
      (await db.query<{ p: string }>(`select p from unnest(array['select','insert','update','delete','truncate','references','trigger']) p where has_table_privilege('${role}', 'public.${table}', p) order by 1`)).rows.map((r) => r.p);
    for (const table of ["unit_folders", "folder_files"]) {
      expect(await perms(table, "anon"), `${table} anon`).toEqual([]);
      expect(await perms(table, "authenticated"), `${table} authenticated`).toEqual(["select"]);
      // the server's own key (service role) keeps full use, which is how the app reads and writes these tables
      expect(await perms(table, "service_role"), `${table} service_role`).toEqual(["delete", "insert", "references", "select", "trigger", "truncate", "update"]);
    }
  });
  it("keep plate numbers in one clean form and refuse a bad case or location", async () => {
    await expect(db.query(`insert into public.unit_folders (plate_no, plate_display) values ('aax-3622', 'x')`)).rejects.toThrow();
    await expect(db.query(`update public.unit_folders set case_type = 'weird' where plate_no = 'AAX3622'`)).rejects.toThrow();
    await expect(db.query(`update public.unit_folders set location = 'garage' where plate_no = 'AAX3622'`)).rejects.toThrow();
  });
  it("delete a car's files with its folder row", async () => {
    await db.query(`insert into public.folder_files (plate_no, drive_file_id, filename) values ('AAX3622', 'file-1', 'IMG_1.HEIC')`);
    await db.query(`delete from public.unit_folders where plate_no = 'AAX3622'`);
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.folder_files")).rows[0].n).toBe(0);
  });
});
