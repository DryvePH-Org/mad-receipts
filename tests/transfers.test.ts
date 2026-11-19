import { describe, expect, it } from "vitest";
import { ageingDays, transferColumns, transferState } from "@/lib/transfers/model";

const input = { particular: " orcr  transfer ", financing: "", buyer: "juan dela cruz", address: "Quezon City", contact: " SIR GIBSON - 0917 ", crDate: "2026-06-26", transactionDate: "26/06/2026", liaison: "", sales: "", balance: "", note: "", doneOn: "" };

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
});
