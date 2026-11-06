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
