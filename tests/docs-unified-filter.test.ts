import { describe, expect, it } from "vitest";
import { filterUnified, type UnifiedRow } from "@/lib/docsbible/unified";

const row = (plate: string, folder: UnifiedRow["folder"], stage: UnifiedRow["stage"] = "review"): UnifiedRow => ({
  payment: null,
  unitId: plate, plate, plateDisplay: plate, car: `car ${plate}`, caseLabel: "Clean", stage, papers: null, flagged: false, decisions: 0, files: 1,
  location: folder === "none" ? null : folder, folder, or: { state: "unknown", days: null }, buyer: null, complete: null, searchText: plate.toLowerCase(),
});
const rows = [row("AAA1111", "available"), row("BBB2222", "available", "approved"), row("CCC3333", "sold", "sold"), row("DDD4444", "none", "none")];

describe("the folder filter of Car documents", () => {
  it("shows everything by default", () => {
    expect(filterUnified(rows, "all", "", false).length).toBe(4);
    expect(filterUnified(rows, "all", "", false, "all").length).toBe(4);
  });
  it("shows only the cars in the Available units folder", () => {
    expect(filterUnified(rows, "all", "", false, "available").map((r) => r.plate)).toEqual(["AAA1111", "BBB2222"]);
  });
  it("shows the Sold units folder and the cars with no folder", () => {
    expect(filterUnified(rows, "all", "", false, "sold").map((r) => r.plate)).toEqual(["CCC3333"]);
    expect(filterUnified(rows, "all", "", false, "none").map((r) => r.plate)).toEqual(["DDD4444"]);
  });
  it("combines with the stage and the search", () => {
    expect(filterUnified(rows, "approved", "", false, "available").map((r) => r.plate)).toEqual(["BBB2222"]);
    expect(filterUnified(rows, "all", "aaa", false, "sold")).toEqual([]);
  });
});

describe("the OR due filter", () => {
  it("shows only cars whose OR is overdue or due within 30 days", () => {
    const withOr = (plate: string, state: UnifiedRow["or"]["state"]) => ({ ...row(plate, "available"), or: { state, days: 5 } });
    const list = [withOr("AAA1111", "soon"), withOr("BBB2222", "overdue"), withOr("CCC3333", "ok"), withOr("DDD4444", "unknown")];
    expect(filterUnified(list, "all", "", false, "all", true).map((r) => r.plate)).toEqual(["AAA1111", "BBB2222"]);
    expect(filterUnified(list, "all", "", false, "all", false).length).toBe(4);
  });
});
