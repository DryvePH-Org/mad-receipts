import { describe, expect, it } from "vitest";
import { selectAll } from "@/lib/supabase/select-all";

/** A table of n rows that answers 1000 at most, like the database does. */
const table = (n: number) => async (from: number, to: number) => ({ data: Array.from({ length: Math.max(0, Math.min(to, n - 1) - from + 1) }, (_, i) => from + i), error: null });

describe("every row of a query, in pages", () => {
  it("gets all of 1121 rows (a plain limit stops at 1000)", async () => {
    const rows = await selectAll(table(1121));
    expect(rows.length).toBe(1121);
    expect(rows[0]).toBe(0); expect(rows[1120]).toBe(1120);
  });
  it("gets small, empty and exactly-full tables", async () => {
    expect((await selectAll(table(0))).length).toBe(0);
    expect((await selectAll(table(37))).length).toBe(37);
    expect((await selectAll(table(4000))).length).toBe(4000); // the first four pages are exactly full: one more is asked, and it is empty
    expect((await selectAll(table(9500))).length).toBe(9500);
  });
  it("stops with the database's message when a page fails", async () => {
    await expect(selectAll(async () => ({ data: null, error: { message: "boom" } }))).rejects.toThrow("boom");
  });
});
