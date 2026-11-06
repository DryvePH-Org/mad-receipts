import { describe, expect, it } from "vitest";

import { buildAuditDiff, isAuditAction, isAuditEntityType } from "@/lib/pcf/audit";

describe("buildAuditDiff", () => {
  it("lists every field as changed when there is no prior row", () => {
    const rows = buildAuditDiff(null, { status: "draft", amount: 100 });
    expect(rows).toEqual([
      { field: "amount", before: "—", after: "100" },
      { field: "status", before: "—", after: "draft" },
    ]);
  });

  it("only reports fields whose value actually changed", () => {
    const rows = buildAuditDiff(
      { status: "released", amount: 100 },
      { status: "approved", amount: 100 },
    );
    expect(rows).toEqual([{ field: "status", before: "released", after: "approved" }]);
  });

  it("ignores bookkeeping timestamp columns", () => {
    const rows = buildAuditDiff(
      { status: "draft", updated_at: "2026-01-01T00:00:00Z" },
      { status: "draft", updated_at: "2026-01-02T00:00:00Z" },
    );
    expect(rows).toEqual([]);
  });

  it("returns nothing when both sides are empty", () => {
    expect(buildAuditDiff(null, null)).toEqual([]);
  });
});

describe("isAuditEntityType / isAuditAction", () => {
  it("accepts only the known values", () => {
    expect(isAuditEntityType("vouchers")).toBe(true);
    expect(isAuditEntityType("unknown")).toBe(false);
    expect(isAuditAction("status_change")).toBe(true);
    expect(isAuditAction("delete")).toBe(false);
  });
});
