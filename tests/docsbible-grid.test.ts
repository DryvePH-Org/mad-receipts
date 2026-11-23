import { describe, expect, it } from "vitest";
import { canEditColumn, checkEdit, COLUMN_BY_KEY, COLUMNS, EMPTY_GRID_FILTER, filterRows, VIEWS, type GridRow } from "../src/lib/docsbible/grid";

const col = (k: string) => COLUMN_BY_KEY.get(k)!;
const row = (id: string, values: Record<string, string | null>, complete: string | null = null, decisions = 0): GridRow => ({ id, values, complete, decisions });

describe("who edits which column", () => {
  it("Buying edits the papers, the OR date, the spare key and the arrival; the car's details (make, model, color...) are the Admins', Admin also the one state, nobody the two old status columns (worked out from the state), Sales and Online Marketing only look", () => {
    expect(canEditColumn("buying", col("cr"))).toBe(true);
    expect(canEditColumn("buying", col("classification"))).toBe(true);
    expect(canEditColumn("buying", col("remarks_1"))).toBe(true);
    expect(canEditColumn("buying", col("make"))).toBe(false); // the details of the car are the Admins'; Buying fills in About the car
    expect(canEditColumn("buying", col("spare_key"))).toBe(true);
    expect(canEditColumn("buying", col("renewal"))).toBe(true);
    expect(canEditColumn("buying", col("arrival_date"))).toBe(true);
    expect(canEditColumn("buying", col("stock_state"))).toBe(false);
    expect(canEditColumn("admin", col("stock_state"))).toBe(true);
    expect(canEditColumn("admin", col("vehicle_status"))).toBe(false); // derived from the state
    expect(canEditColumn("admin", col("sale_status"))).toBe(false);
    expect(canEditColumn("admin", col("make"))).toBe(true);
    expect(canEditColumn("sales", col("cr"))).toBe(false); // the IN documents are for Buying and the Admins; Sales read them
    expect(canEditColumn("sales", col("stock_state"))).toBe(false);
    expect(canEditColumn("super_admin", col("stock_state"))).toBe(true);
    expect(canEditColumn("marketing", col("cr"))).toBe(false);
    expect(canEditColumn("marketing", col("stock_state"))).toBe(false);
  });
  it("nobody types the plate or the COMPLETE column", () => {
    expect(canEditColumn("admin", col("complete_docs"))).toBe(false);
    expect(canEditColumn("admin", col("plate_display"))).toBe(false);
  });
});

describe("checking an edit", () => {
  it("accepts only the choices of a paper column, and an empty cell", () => {
    expect(checkEdit(col("cr"), "Yes")).toEqual({ ok: true, value: "Yes" });
    expect(checkEdit(col("cr"), "")).toEqual({ ok: true, value: null });
    expect(checkEdit(col("cr"), "yes").ok).toBe(false);
  });
  it("never lets the classification be emptied or made up", () => {
    expect(checkEdit(col("classification"), "Clean").ok).toBe(true);
    expect(checkEdit(col("classification"), "").ok).toBe(false);
    expect(checkEdit(col("classification"), "Company").ok).toBe(false);
  });
  it("reads a date and refuses nonsense", () => {
    expect(checkEdit(col("arrival_date"), "7/10/2026")).toEqual({ ok: true, value: "2026-07-10" });
    expect(checkEdit(col("arrival_date"), "7/102/2026").ok).toBe(false);
  });
  it("trims text and limits its length", () => {
    expect(checkEdit(col("cs_no"), "  ab 12  ")).toEqual({ ok: true, value: "ab 12" });
    expect(checkEdit(col("cs_no"), "x".repeat(301)).ok).toBe(false);
    expect(checkEdit(col("color"), "  white  ")).toEqual({ ok: true, value: "WHITE" }); // a detail of the car follows its standard format
    expect(checkEdit(col("remarks_1"), "a\r\nb")).toEqual({ ok: true, value: "a\nb" });
  });
});

describe("the table", () => {
  it("every view uses real columns and starts with the plate", () => {
    for (const v of Object.values(VIEWS)) { expect(v.keys[0]).toBe("plate_display"); for (const k of v.keys) expect(COLUMN_BY_KEY.has(k)).toBe(true); }
    expect(VIEWS.everything.keys).toHaveLength(COLUMNS.length);
  });
  const rows = [
    row("1", { plate_display: "NGR 7902", make: "TOYOTA", classification: "Clean", vehicle_status: "AVAILABLE" }, "COMPLETE"),
    row("2", { plate_display: "ABC1234", make: "HONDA", classification: "Repo (bank)", vehicle_status: "SOLD", remarks_1: "ORIG DOCS AT JEP" }, "NOT YET", 1),
    row("3", { plate_display: "XYZ999", make: "FORD", classification: "Not classified (legacy)", vehicle_status: "SOLD" }, null),
  ];
  it("searches a plate however it is typed, and other text", () => {
    expect(filterRows(rows, { ...EMPTY_GRID_FILTER, q: "ngr7902" }).map((r) => r.id)).toEqual(["1"]);
    expect(filterRows(rows, { ...EMPTY_GRID_FILTER, q: "jep" }).map((r) => r.id)).toEqual(["2"]);
  });
  it("filters by classification, completeness, status and the ones needing a decision", () => {
    expect(filterRows(rows, { ...EMPTY_GRID_FILTER, classification: "Repo (bank)" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterRows(rows, { ...EMPTY_GRID_FILTER, complete: "NONE" }).map((r) => r.id)).toEqual(["3"]);
    expect(filterRows(rows, { ...EMPTY_GRID_FILTER, vehicle: "SOLD" }).map((r) => r.id)).toEqual(["2", "3"]);
    expect(filterRows(rows, { ...EMPTY_GRID_FILTER, needsDecision: true }).map((r) => r.id)).toEqual(["2"]);
  });
});
