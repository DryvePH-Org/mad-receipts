import { describe, expect, it } from "vitest";
import type { HeardSalesperson } from "@/lib/extraction/voice-schema";
import { filledRows, rowsFromDeal, rowsFromVoice, toPayload, validateRows, type SalesRow } from "@/lib/salespeople/rows";

const active = [
  { id: "david", name: "David Santos" },
  { id: "ella", name: "Ella" },
];
const names = new Map([...active.map((p) => [p.id, p.name] as const), ["gone", "Old Timer"]]);
const options = { active, names };
const row = (salespersonId: string, percent: string, heard?: string): SalesRow => ({ key: Math.random().toString(), salespersonId, percent, heard });

describe("rowsFromVoice", () => {
  const heard: HeardSalesperson[] = [
    { spoken: "David", salespersonId: "david", confidence: "exact", commission_percent: 3 },
    { spoken: "Elia", salespersonId: "ella", confidence: "close", commission_percent: 1.5 },
    { spoken: "Pedro", salespersonId: null, confidence: "none", commission_percent: null },
  ];

  it("fills the matched name and percent, and shows what was heard when it needs checking", () => {
    expect(rowsFromVoice(heard).map(({ salespersonId, percent, heard }) => ({ salespersonId, percent, heard }))).toEqual([
      { salespersonId: "david", percent: "3", heard: undefined },
      { salespersonId: "ella", percent: "1.5", heard: "Elia" },
      { salespersonId: "", percent: "", heard: "Pedro" },
    ]);
  });

  it("gives rows stable keys, so the server and the browser render the same ids", () => {
    expect(rowsFromVoice(heard).map((r) => r.key)).toEqual(["v0", "v1", "v2"]);
    expect(rowsFromVoice(heard).map((r) => r.key)).toEqual(["v0", "v1", "v2"]);
  });

  it("keeps at most five", () => {
    expect(rowsFromVoice(Array.from({ length: 8 }, () => heard[0]))).toHaveLength(5);
  });
});

describe("rowsFromDeal", () => {
  it("shows a deal's saved salespeople", () => {
    expect(rowsFromDeal([{ salespersonId: "david", percent: 3 }]).map((r) => [r.salespersonId, r.percent])).toEqual([["david", "3"]]);
    expect(rowsFromDeal([{ salespersonId: "david", percent: 3 }]).map((r) => r.key)).toEqual(["d0"]);
  });
});

describe("validateRows", () => {
  it("accepts complete rows and none while the deal is still open", () => {
    expect(validateRows([row("david", "3"), row("ella", "1.5")], options, true)).toEqual([]);
    expect(validateRows([], options, false)).toEqual([]);
    expect(validateRows([row("", "")], options, false)).toEqual([]); // blank rows are ignored
  });

  it("requires a salesperson when the payment completes the sale", () => {
    expect(validateRows([], options, true)).toEqual(["Add who sold the car and their commission % to complete the sale."]);
    expect(validateRows([row("", "")], options, true)).toHaveLength(1);
  });

  it("asks staff to choose a name that was not matched", () => {
    expect(validateRows([row("", "2", "Pedro")], options, false)).toEqual(['Choose who "Pedro" is.']);
    expect(validateRows([row("", "2")], options, false)).toEqual(["Choose a salesperson."]);
  });

  it("requires each person's own percent from 0 to 100", () => {
    expect(validateRows([row("david", "")], options, false)).toEqual(["Enter David Santos's commission % (0 to 100)."]);
    expect(validateRows([row("david", "101")], options, false)).toHaveLength(1);
    expect(validateRows([row("david", "abc")], options, false)).toHaveLength(1);
    expect(validateRows([row("david", "0")], options, false)).toEqual([]);
    expect(validateRows([row("david", "100"), row("ella", "100")], options, false)).toEqual([]); // no need to total 100
  });

  it("rejects duplicates, inactive people and too many rows", () => {
    expect(validateRows([row("david", "3"), row("david", "2")], options, false)).toEqual(["Each salesperson can only be listed once."]);
    expect(validateRows([row("gone", "3")], options, false)[0]).toMatch(/Old Timer isn't on the active list/);
    expect(validateRows(Array.from({ length: 6 }, (_, i) => row(`p${i}`, "1")), options, false)).toContain("At most 5 salespeople.");
  });
});

describe("toPayload / filledRows", () => {
  it("sends only filled rows, with numeric percents", () => {
    const rows = [row("david", "3"), row("", ""), row("ella", "1.5")];
    expect(filledRows(rows)).toHaveLength(2);
    expect(toPayload(rows)).toEqual([
      { salespersonId: "david", commissionPercent: 3 },
      { salespersonId: "ella", commissionPercent: 1.5 },
    ]);
  });
});
