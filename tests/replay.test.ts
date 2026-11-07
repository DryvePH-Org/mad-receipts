import { describe, expect, it, vi } from "vitest";
import { classify, planReplay, runReplay } from "@/lib/sync/replay";

vi.mock("server-only", () => ({}));

const ref = { receiptNo: "1", people: [{ name: "Aaron", percent: null }], date: "11/6" };

describe("comparing a car with the live sheet", () => {
  it("writes when the live sheet has no status", () => {
    expect(classify("Reserved", "", ref)).toMatchObject({ action: "change", next: "RESERVED - AARON 11/6" });
    expect(classify("Reserved", "BIG DROP", ref)).toMatchObject({ action: "change", next: "RESERVED - AARON 11/6 | BIG DROP" }); // other notes are kept
  });
  it("leaves it alone when the live sheet already says it", () => {
    expect(classify("Reserved", "RESERVED - AARON 11/6", ref).action).toBe("same");
  });
  it("flags a different status or different names for a person to decide", () => {
    expect(classify("Reserved", "SOLD - ELLA 3% 10/30", ref).action).toBe("conflict");
    expect(classify("Sold", "RESERVED - ELLA 10/30", ref).action).toBe("conflict");
    expect(classify("Reserved", "RESERVED - ELLA 10/30", ref).action).toBe("conflict");
  });
  it("says so when the plate is not in the live sheet, and has nothing to clear on an empty one", () => {
    expect(classify("Reserved", null, ref).action).toBe("missing");
    expect(classify("Available", "", ref).action).toBe("same");
  });
});

// A stand-in for the database and the inventory sheet.
function world() {
  const tables: Record<string, unknown[]> = {
    deal_summaries: [
      { id: "d1", deal_no: "D1001", status: "open", balance: 480000, due_date: null, sale_type: "cash", loan_status: "none", created_by: "u1", created_at: "2026-11-01" },
      { id: "d2", deal_no: "D1002", status: "open", balance: 0, due_date: null, sale_type: "cash", loan_status: "none", created_by: "u1", created_at: "2026-11-02" },
      { id: "d3", deal_no: "D1003", status: "open", balance: 100, due_date: null, sale_type: "cash", loan_status: "none", created_by: "u1", created_at: "2026-11-03" }, // no approved receipt: ignored
    ],
    deal_units: [
      { deal_id: "d1", make_type: "Vios", plate_no: "AAA1111", plate_display: "AAA 1111" },
      { deal_id: "d2", make_type: "Civic", plate_no: "BBB2222", plate_display: "BBB 2222" },
      { deal_id: "d3", make_type: "Ghost", plate_no: "CCC3333", plate_display: "CCC 3333" },
    ],
    receipts: [{ id: "r1", deal_id: "d1", receipt_date: "2026-10-20", created_at: "2026-11-06" }, { id: "r2", deal_id: "d2", receipt_date: "2026-10-25", created_at: "2026-11-06" }],
    profiles: [{ id: "u1", full_name: "Aaron" }],
  };
  const log: string[] = [];
  const chain = (rows: unknown[]) => { const c: Record<string, unknown> = { then: (ok: (v: unknown) => unknown) => ok({ data: rows, error: null }), eq: () => c, order: () => c, in: () => c, select: () => c }; return c; };
  const admin = {
    from: (t: string) => ({ select: () => chain(tables[t] ?? []), update: (v: unknown) => ({ in: async () => { log.push(`update ${t} ${JSON.stringify(v)}`); return { error: null }; } }) }),
    rpc: async (fn: string, args: { p_receipt_id: string; p_targets: string[] }) => { log.push(`rpc ${fn} ${args.p_receipt_id} ${args.p_targets.join("+")}`); return { error: null }; },
  };
  const remarks: Record<string, string | null> = { AAA1111: "", BBB2222: "SOLD - ELLA 3% 10/30", CCC3333: "" };
  const inv = {
    getUnit: async (p: string) => (remarks[p] === undefined || remarks[p] === null ? null : { plate: p, status: "Available", remarks: remarks[p]! }),
    listUnits: async () => [],
    setStatus: async (p: string, status: string, r: { date: string }) => { log.push(`inventory ${p} ${status} ${r.date}`); },
  };
  return { admin: admin as never, inv: inv as never, log };
}

describe("the replay plan", () => {
  it("looks only at cars with an approved receipt, dates the note from the receipt, and flags differences", async () => {
    const { admin, inv } = world();
    const { cars, approvedReceipts } = await planReplay(admin, inv);
    expect(approvedReceipts).toBe(2);
    expect(cars.map((c) => [c.plate, c.action, c.ref.date])).toEqual([["BBB2222", "conflict", "10/25"], ["AAA1111", "change", "10/20"]]);
  });
  it("writes only the ticked cars, and queues log rows and Drive filing for every approved receipt", async () => {
    const { admin, inv, log } = world();
    const r = await runReplay(admin, inv, { plates: ["AAA1111"], logRows: true, drive: true });
    expect(r).toMatchObject({ written: 1, queued: 4 });
    expect(log).toContain("inventory AAA1111 Reserved 10/20");
    expect(log.some((l) => l.startsWith("inventory BBB2222"))).toBe(false); // the conflict was not ticked, so it is untouched
    expect(log.some((l) => l.includes("drive_file_id"))).toBe(true); // refiled in the live folder
    expect(log.filter((l) => l.startsWith("rpc queue_sync"))).toEqual(["rpc queue_sync r1 sheets+drive", "rpc queue_sync r2 sheets+drive"]);
  });
  it("with nothing chosen, nothing is written", async () => {
    const { admin, inv, log } = world();
    expect(await runReplay(admin, inv, { plates: [], logRows: false, drive: false })).toMatchObject({ written: 0, queued: 0 });
    expect(log).toEqual([]);
  });
});
