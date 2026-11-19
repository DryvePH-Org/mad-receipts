import { describe, expect, it } from "vitest";
import { appendNote, cleanItem, cleanStatus, isOpen, isOverdue, stageOf, stateAfterRepairs } from "@/lib/repairs/model";

describe("repairs", () => {
  it("is open only when approved and in an open status", () => {
    expect(isOpen({ status: "In progress", approval: "approved" })).toBe(true);
    expect(isOpen({ status: "IN PROGRESS", approval: "pending" })).toBe(false);
    expect(isOpen({ status: "DONE", approval: "approved" })).toBe(false);
    expect(stageOf({ status: "PENDING APPROVAL", approval: "pending" })).toBe("pending");
    expect(stageOf({ status: "REJECTED", approval: "rejected" })).toBe("rejected");
    expect(stageOf({ status: "SOLD", approval: "approved" })).toBe("closed");
  });
  it("is overdue only while open and past its date", () => {
    expect(isOverdue({ status: "OPEN", approval: "approved", dueOn: "2026-11-10" }, "2026-11-19")).toBe(true);
    expect(isOverdue({ status: "DONE", approval: "approved", dueOn: "2026-11-10" }, "2026-11-19")).toBe(false);
    expect(isOverdue({ status: "OPEN", approval: "approved", dueOn: null }, "2026-11-19")).toBe(false);
  });
  it("refuses a status it does not know", () => {
    expect(cleanStatus("done")).toBe("DONE");
    expect(cleanStatus("maybe tomorrow")).toBeNull();
  });
  it("needs a problem and trims the rest", () => {
    expect(cleanItem({ problem: "  " })).toBeNull();
    expect(cleanItem({ problem: " Flat  tire ", supplier: " Mang Jun ", reportedOn: "2026-11-10" })).toMatchObject({ problem: "Flat tire", supplier: "Mang Jun", reportedOn: "2026-11-10", status: "IN PROGRESS" });
  });
  it("adds a note after the solution and drops the oldest notes when too long", () => {
    expect(appendNote("Vulcanize", "Tire fixed", "2026-11-10")).toBe("Vulcanize [11/10] Tire fixed");
    const long = appendNote(`Fix ${"x".repeat(200)} [1/2] ${"a".repeat(150)} [2/3] ${"b".repeat(100)}`, "c".repeat(60), "2026-11-10");
    expect(long.length).toBeLessThanOrEqual(480);
    expect(long.endsWith("[11/10] " + "c".repeat(60))).toBe(true);
  });
  it("puts an Onhand car to For repair and back, and leaves reserved or sold cars alone", () => {
    expect(stateAfterRepairs("Onhand", 1)).toBe("For repair");
    expect(stateAfterRepairs("For repair", 0)).toBe("Onhand");
    expect(stateAfterRepairs("Reserved", 2)).toBeNull();
    expect(stateAfterRepairs("Sold", 0)).toBeNull();
    expect(stateAfterRepairs("Sell as is", 1)).toBeNull();
  });
});
