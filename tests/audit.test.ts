import { describe, expect, it } from "vitest";
import { actionLabel, auditSummary, changedDetails } from "@/lib/audit";

const deal = (over: Record<string, unknown> = {}) => ({ plate_no: "NKF4771", buyer_name: "Jose Rizal", color: "Black", ...over });

describe("auditSummary", () => {
  it("summarizes a confirmed receipt", () => {
    expect(auditSummary({ action: "receipt.confirm", before: null, after: { receipt: { receipt_no: "2556", amount: 50000 }, deal: deal() } })).toBe(
      "No. 2556 · ₱50,000 · NKF4771",
    );
  });
  it("summarizes a void and a cancel", () => {
    expect(
      auditSummary({ action: "receipt.void", before: { receipt: { receipt_no: "2557" } }, after: { receipt: { void_reason: "wrong amount" } } }),
    ).toBe("No. 2557 voided: wrong amount");
    expect(auditSummary({ action: "deal.cancel", before: null, after: { plate_no: "NKF4771", cancel_reason: "backed out", forfeited: true } })).toBe(
      "NKF4771 cancelled: backed out (money forfeited)",
    );
    expect(auditSummary({ action: "deal.cancel", before: null, after: { plate_no: "NKF4771", cancel_reason: "x", forfeited: false } })).toBe(
      "NKF4771 cancelled: x",
    );
  });
  it("says what changed in a deal edit", () => {
    const before = { deal: deal(), salespeople: [{ name: "David", commission_percent: 3 }] };
    const after = { deal: deal({ buyer_name: "Jose P. Rizal", color: "Blue" }), salespeople: [{ name: "Ella", commission_percent: 1 }] };
    expect(auditSummary({ action: "deal.update", before, after })).toBe("NKF4771: changed buyer name, color, salespeople");
    expect(auditSummary({ action: "deal.update", before, after: before })).toBe("NKF4771: saved with no changes");
    expect(changedDetails(before, before)).toEqual([]);
  });
  it("copes with missing data and unknown actions", () => {
    expect(auditSummary({ action: "receipt.confirm", before: null, after: null })).toBe("");
    expect(auditSummary({ action: "something.else", before: null, after: null })).toBe("");
    expect(actionLabel("receipt.void")).toBe("Receipt voided");
    expect(actionLabel("something.else")).toBe("something.else");
  });
});
