import { describe, expect, it } from "vitest";
import { ageingDays, isOpen, transferColumns, transferState } from "@/lib/transfers/model";

const input = { soldOn: "2026-06-20", agreedPrice: "₱ 1,250,000.50", route: "mad" as const, stage: "released" as const, originalsAt: " with  Jep ", nextStep: "", particular: " orcr  transfer ", financing: "", buyer: "juan dela cruz", address: "Quezon City", contact: " SIR GIBSON - 0917 ", crDate: "2026-06-26", transactionDate: "26/06/2026", liaison: "", sales: "", balance: "", note: "", doneOn: "" };

describe("transfers", () => {
  it("saves names in capitals, blanks as nothing, and only clear dates", () => {
    expect(transferColumns(input)).toMatchObject({ particular: "ORCR TRANSFER", financing: null, buyer: "JUAN DELA CRUZ", contact: "SIR GIBSON - 0917", cr_date: "2026-06-26", transaction_date: null, done_on: null });
  });
  it("works the ageing out when shown, never stores it", () => {
    expect(ageingDays("2026-11-01", "2026-11-19")).toBe(18);
    expect(ageingDays(null, "2026-11-19")).toBeNull();
    expect(ageingDays("junk", "2026-11-19")).toBeNull();
  });
  it("a finished transfer has no ageing", () => {
    expect(transferState({ doneOn: "2026-11-10", crDate: "2026-06-26" }, "2026-11-19")).toEqual({ done: true, days: null });
    expect(transferState({ doneOn: null, crDate: "2026-11-09" }, "2026-11-19")).toEqual({ done: false, days: 10 });
  });
  it("saves the sale: the date, the price without peso signs or commas, the stage and where the papers are", () => {
    expect(transferColumns(input)).toMatchObject({ sold_on: "2026-06-20", agreed_price: 1250000.5, route: "mad", stage: "released", originals_at: "with Jep", next_step: null });
    expect(transferColumns({ ...input, agreedPrice: "free", soldOn: "20/06/2026", route: "bike" as never, stage: "lost" as never })).toMatchObject({ sold_on: null, agreed_price: null, route: "unknown", stage: "unknown" });
  });
  it("counts a record as open work only when it is not delivered, not finished and not an old reference row", () => {
    expect(isOpen({ doneOn: null, stage: "in_process", isReference: false })).toBe(true);
    expect(isOpen({ doneOn: null, stage: "delivered", isReference: false })).toBe(false);
    expect(isOpen({ doneOn: "2026-10-01", stage: "released", isReference: false })).toBe(false);
    expect(isOpen({ doneOn: null, stage: "unknown", isReference: true })).toBe(false);
    expect(transferState({ doneOn: null, crDate: "2026-11-09", stage: "delivered" }, "2026-11-19")).toEqual({ done: true, days: null });
  });
});
