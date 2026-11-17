import { describe, expect, it } from "vitest";
import { sheetChangesSinceMove, type MovedRow } from "../src/lib/golive/cutover";

const plateOf = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");
const header = ["", "CATEGORY", "PLATE NO.", "CLASSIFICATION", "CR", "OR", "REMARKS I"];
const moved: MovedRow[] = [
  { plate: "NGR7902", sourceRow: 2, raw: { "D CLASSIFICATION": "Clean", "E CR": "Yes", "F OR": "Yes" } },
  { plate: "ABC1234", sourceRow: 3, raw: { "D CLASSIFICATION": "Repo (bank)", "E CR": "To follow" } },
];

describe("the old sheet, after the move", () => {
  it("reports nothing when the sheet still says what it said at the move", () => {
    const rows = [header, ["", "NORMAL", "NGR 7902", "Clean", "Yes", "Yes", ""], ["", "NORMAL", "ABC1234", "Repo (bank)", "To follow", "", ""]];
    expect(sheetChangesSinceMove(rows, moved, plateOf)).toMatchObject({ changed: [], carsChanged: 0, newPlates: [] });
  });
  it("finds a typed cell that changed, a cell that was emptied, and a row added since", () => {
    const rows = [header, ["", "NORMAL", "NGR7902", "Clean", "No", "Yes", "new note"], ["", "NORMAL", "ABC1234", "Repo (bank)", "", "", ""], ["", "NORMAL", "ZZZ9999", "Clean", "Yes", "Yes", ""]];
    const r = sheetChangesSinceMove(rows, moved, plateOf);
    expect(r.changed.map((c) => [c.plate, c.column, c.was, c.now])).toEqual([["NGR7902", "CR", "Yes", "No"], ["NGR7902", "REMARKS I", "", "new note"], ["ABC1234", "CR", "To follow", ""]]);
    expect(r.carsChanged).toBe(2);
    expect(r.newPlates).toEqual(["ZZZ9999"]);
  });
  it("does not count an error cell, extra spaces, or a column nobody types in", () => {
    const rows = [header, ["", "CHANGED CATEGORY", "NGR7902", "Clean ", "#REF!", "Yes", ""], ["", "NORMAL", "ABC1234", "Repo (bank)", "To  follow", "", ""]];
    expect(sheetChangesSinceMove(rows, moved, plateOf).changed).toEqual([]);
  });
});
