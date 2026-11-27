import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "./harness";

// The agreed price on the car (migration 77): a text column, and the amounts the Admins had written in the note of the state are moved into it.
let db: Db;
beforeAll(async () => { db = await createDb(); }, 60_000);

const MIGRATION = readFileSync("supabase/migrations/20261127000077_agreed_price_on_the_car.sql", "utf8");
const COPY = MIGRATION.slice(MIGRATION.indexOf("update public.docs_units"));
const add = (plate: string, state: string, note: string | null) => db.query("insert into public.docs_units (plate_no, plate_display, stock_state, stock_note) values ($1, $1, $2, $3)", [plate, state, note]);
const price = async (plate: string) => (await db.query<{ agreed_price: string | null }>("select agreed_price from public.docs_units_current where plate_no = $1", [plate])).rows[0].agreed_price;

describe("the agreed price on the car", () => {
  it("is a text, up to 60 characters, and the current-car view has it", async () => {
    await add("AGR0001", "Sold", null);
    await db.query("update public.docs_units set agreed_price = '600,000 plus the fee' where plate_no = 'AGR0001'");
    expect(await price("AGR0001")).toBe("600,000 plus the fee");
    await expect(db.query("update public.docs_units set agreed_price = $1 where plate_no = 'AGR0001'", ["x".repeat(61)])).rejects.toThrow();
  });
  it("takes the first amount out of the note of a reserved or sold car, and leaves the note alone", async () => {
    const notes: [string, string, string][] = [
      ["AGR0002", "Sold", "Sold via Financing GDFI at 476,000; GDFI 400,000, DP 76,000"], ["AGR0003", "Sold", "closed at 1,000,000; 20k reservation"], ["AGR0004", "Sold", "Closed at 449,000"],
      ["AGR0005", "Sold", "Agre Price: 600,000"], ["AGR0006", "Reserved", "Agreed at 471,000"], ["AGR0007", "Reserved", "reserved at 300,000 pending GDFI Approval"],
      ["AGR0008", "Sold", "48V battery arrived, installation in progress"], ["AGR0009", "Onhand", "Agreed at 100,000"],
    ];
    for (const [p, s, n] of notes) await add(p, s, n);
    await db.query(COPY);
    expect(await Promise.all(notes.map(([p]) => price(p)))).toEqual(["476,000", "1,000,000", "449,000", "600,000", "471,000", "300,000", null, null]);
    expect((await db.query<{ stock_note: string }>("select stock_note from public.docs_units where plate_no = 'AGR0006'")).rows[0].stock_note).toBe("Agreed at 471,000");
  });
  it("never replaces a price somebody already typed", async () => {
    await add("AGR0010", "Sold", "Closed at 500,000");
    await db.query("update public.docs_units set agreed_price = '510,000 cash' where plate_no = 'AGR0010'");
    await db.query(COPY);
    expect(await price("AGR0010")).toBe("510,000 cash");
  });
});
