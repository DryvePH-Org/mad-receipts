import { describe, expect, it, vi } from "vitest";
import { phraseMatches, RESETS } from "@/lib/reset";
import { runReset } from "@/lib/reset-run";

vi.mock("server-only", () => ({}));

// A stand-in for the database that only records what was deleted, and in what order.
function fake() {
  const log: string[] = [];
  const files: Record<string, { name: string; id: string | null }[]> = { "": [{ name: "user-1", id: null }], "user-1": [{ name: "a.jpg", id: "x" }, { name: "b.jpg", id: "y" }] };
  const admin = {
    from: (table: string) => ({
      delete: () => ({ neq: async () => { log.push(`delete ${table}`); return { count: 3, error: null }; } }),
      insert: async (row: { action: string; after: unknown }) => { log.push(`log ${row.action}`); return { error: null }; },
    }),
    rpc: async (fn: string) => { log.push(`rpc ${fn}`); return { error: null }; },
    storage: { from: () => ({
      list: async (path: string) => { const l = files[path] ?? []; return { data: path === "user-1" && log.includes("removed") ? [] : l, error: null }; },
      remove: async (paths: string[]) => { log.push(`remove ${paths.join(",")}`); if (paths[0]?.startsWith("user-1/")) log.push("removed"); return { error: null }; },
    }) },
  };
  return { admin: admin as never, log };
}

describe("typed confirmation", () => {
  it("needs the exact words for each reset", () => {
    for (const r of RESETS) {
      expect(phraseMatches(r.kind, r.phrase)).toBe(true);
      expect(phraseMatches(r.kind, ` ${r.phrase} `)).toBe(true);
      expect(phraseMatches(r.kind, r.phrase.toLowerCase())).toBe(false);
      expect(phraseMatches(r.kind, "")).toBe(false);
    }
    expect(phraseMatches("transactions", "DELETE EVERYTHING")).toBe(false); // another button's words do not work
    expect(phraseMatches("nonsense", "DELETE ALL TRANSACTIONS")).toBe(false);
  });
});

describe("what each reset deletes", () => {
  it("transactions: proofs, then sync jobs, receipts, deals, restart the numbers, and write one log line", async () => {
    const { admin, log } = fake();
    await runReset(admin, "transactions", "admin-1");
    expect(log).toEqual(["remove user-1/a.jpg,user-1/b.jpg", "removed", "delete sync_jobs", "delete receipts", "delete deals", "rpc reset_deal_numbers", "log data.reset"]);
  });
  it("the activity log is wiped last, so only the new line is left", async () => {
    const { admin, log } = fake();
    await runReset(admin, "activity", "admin-1");
    expect(log).toEqual(["delete audit_logs", "log data.reset"]);
  });
  it("car documents: files, then folders; nothing else", async () => {
    const { admin, log } = fake();
    await runReset(admin, "documents", "admin-1");
    expect(log).toEqual(["delete folder_files", "delete unit_folders", "log data.reset"]);
  });
  it("everything: all of it, the activity log last", async () => {
    const { admin, log } = fake();
    await runReset(admin, "everything", "admin-1");
    expect(log.filter((l) => l.startsWith("delete"))).toEqual(["delete sync_jobs", "delete receipts", "delete deals", "delete folder_files", "delete unit_folders", "delete audit_logs"]);
    expect(log.at(-1)).toBe("log data.reset");
  });
  it("never touches users or settings", async () => {
    const { admin, log } = fake();
    await runReset(admin, "everything", "admin-1");
    expect(log.join(" ")).not.toMatch(/profiles|app_settings|auth/);
  });
});
