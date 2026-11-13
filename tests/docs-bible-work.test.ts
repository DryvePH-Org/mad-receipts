import { describe, expect, it } from "vitest";
import { loadWorking, markWorking, STALE_WORK_MS } from "@/lib/docs/bible-sync";
import type { createAdminClient } from "@/lib/supabase/admin";

/** A tiny stand-in for the unit_sheet_sync table: rows by plate and kind. */
function fakeAdmin() {
  const rows = new Map<string, Record<string, unknown>>();
  const from = () => {
    const filters: Record<string, string> = {};
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: string) => { filters[c] = v; return q; },
      maybeSingle: async () => ({ data: rows.get(`${filters.plate_no}|${filters.kind}`) ?? null }),
      upsert: async (row: Record<string, unknown>) => { rows.set(`${row.plate_no}|${row.kind}`, { ...rows.get(`${row.plate_no}|${row.kind}`), ...row }); return { error: null }; },
    };
    return q;
  };
  return { admin: { from } as unknown as ReturnType<typeof createAdminClient>, rows };
}

describe("marking a car as being worked on by the bot", () => {
  it("is remembered, and keeps what the app already knew about the sheet", async () => {
    const { admin, rows } = fakeAdmin();
    rows.set("NBU4875|checklist", { plate_no: "NBU4875", kind: "checklist", status: "done", detail: { snapshot: { row: 357, fetchedAt: "x" } }, job_id: "j1" });
    const now = new Date("2026-11-13T10:00:00Z");
    await markWorking("nbu 4875", "send", "u1", admin, now);
    const row = rows.get("NBU4875|checklist")!;
    expect(row.status).toBe("done");
    expect((row.detail as Record<string, unknown>).snapshot).toBeTruthy();
    expect(await loadWorking("NBU4875", admin, new Date(now.getTime() + 60_000))).toMatchObject({ action: "send" });
  });
  it("stops showing as working when it is old (a lost job must never leave the card stuck)", async () => {
    const { admin } = fakeAdmin();
    const now = new Date("2026-11-13T10:00:00Z");
    await markWorking("NBU4875", "check", null, admin, now);
    expect(await loadWorking("NBU4875", admin, new Date(now.getTime() + STALE_WORK_MS - 1000))).not.toBeNull();
    expect(await loadWorking("NBU4875", admin, new Date(now.getTime() + STALE_WORK_MS + 1000))).toBeNull();
  });
  it("is nothing for a car with no record", async () => {
    expect(await loadWorking("ABC1234", fakeAdmin().admin)).toBeNull();
  });
});
