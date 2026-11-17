import { describe, expect, it } from "vitest";
import { classification, dateOf, handoffEvent, paper, plateKey, plateLooksUsual, spareKey, statusesDisagree, text } from "../src/lib/docsbible/normalize";
import { planImport, type Cell, type Snapshot } from "../src/lib/docsbible/import";

describe("cleaning what people typed", () => {
  it("reads Yes, No, To follow and N/A whatever the case and spacing, and never guesses", () => {
    expect(paper("yes").value).toBe("Yes");
    expect(paper(" TO FOLLOW ").value).toBe("To follow");
    expect(paper("n/a").value).toBe("N/A");
    expect(paper("").value).toBeNull();
    expect(paper("maybe").issue).toMatch(/maybe/);
  });
  it("makes plates comparable and flags the unusual ones", () => {
    expect(plateKey("ngr 7902")).toBe("NGR7902");
    expect(plateLooksUsual("NGR7902")).toBe(true);
    expect(plateLooksUsual("136604")).toBe(false);
  });
  it("blank classification is legacy, a wrong one is an issue", () => {
    expect(classification("").value).toBe("Not classified (legacy)");
    expect(classification("clean").value).toBe("Clean");
    expect(classification("Repo").issue).toBeTruthy();
  });
  it("reads dates month first and refuses nonsense", () => {
    expect(dateOf("10/5/2026").value).toBe("2026-10-05");
    expect(dateOf("2026-01-12").value).toBe("2026-01-12");
    expect(dateOf("Oct 5, 2026").value).toBe("2026-10-05");
    expect(dateOf("7/102/2026").value).toBeNull();
    expect(dateOf("7/102/2026").issue).toBeTruthy();
  });
  it("gives one spelling to the spare key and drops errors from text", () => {
    expect(spareKey("W/ SPARE KEY")).toBe("W/SPAREKEY");
    expect(spareKey("w/o sparekey")).toBe("W/O SPAREKEY");
    expect(text("#REF!")).toBeNull();
  });
  it("tells when the two status columns disagree, but not when one is blank", () => {
    expect(statusesDisagree("Sold", "AVAILABLE")).toBe(true);
    expect(statusesDisagree("Onhand", "SHIPPED TO CEB")).toBe(false);
    expect(statusesDisagree("Onhand", null)).toBe(false);
  });
  it("reads the handoff steps from the free typing and keeps the rest out of the events", () => {
    expect(handoffEvent("SUBMITTED TO JEP 9/15", 2026)).toMatchObject({ event: "submitted", date: "2026-09-15", person: "JEP" });
    expect(handoffEvent("ORIG DOCS RECEIVED FROM JEP 10/21/2026", 2026)).toMatchObject({ event: "received", date: "2026-10-21", person: "JEP" });
    expect(handoffEvent("JEP RECEIVED DOCS 09/15/26", 2026)).toMatchObject({ event: "received", date: "2026-09-15" });
    expect(handoffEvent("waiting for the buyer", 2026)?.event).toBe("note");
  });
});

const cell = (row: number, col: number, value: string, type: Cell[3] = "s", formula: string | null = null): Cell => [row, col, value, type, formula];
const header = ["", "CATEGORY", "", "", "", "", "", "", "", "", "PLATE NO.", "", "STATUS", "DATE ARRIVAL"];
const snapshot = (rows: string[][]): Snapshot => {
  const cells: Cell[] = [];
  const heads = ["CATEGORY", "STATUS", "PLATE NO.", "DATE ARRIVAL", "VEHICLE STATUS", "CLASSIFICATION", "CR", "REMARKS I", "REMARKS II"];
  heads.forEach((h, i) => cells.push(cell(1, i + 2, h)));
  rows.forEach((r, n) => r.forEach((v, i) => { if (v !== "") cells.push(cell(n + 2, i + 2, v, v.startsWith("#") ? "e" : "s")); }));
  return { snapshot: "t.xlsx", sha256: "x", takenAt: "now", tabs: { "DOCS 2026": { hidden: false, maxRow: rows.length + 1, maxCol: 12, cells } } };
};
void header;

describe("planning the import", () => {
  const plan = planImport(snapshot([
    ["NORMAL", "Sold", "NGR 7902", "10/5/2026", "SOLD", "Clean", "yes", "SUBMITTED TO JEP 9/15", ""],
    ["NORMAL", "Onhand", "NGR7902", "11/1/2026", "AVAILABLE", "", "", "", "#REF!"],
    ["NORMAL", "Sold", "", "", "AVAILABLE", "", "", "", ""],
    ["NORMAL", "Sold", "ABC1234", "bad date", "AVAILABLE", "Clean", "", "", ""],
  ]));
  it("keeps both arrivals of a plate and tells the staff", () => {
    expect(plan.units.filter((u) => u.plate_no === "NGR7902")).toHaveLength(2);
    expect(plan.issues.some((i) => i.kind === "duplicate_plate" && i.plate === "NGR7902")).toBe(true);
  });
  it("lists a row with no plate instead of dropping it", () => {
    expect(plan.issues.some((i) => i.kind === "no_plate")).toBe(true);
    expect(plan.units).toHaveLength(3);
  });
  it("flags a status that disagrees and a date it cannot read, and does not guess", () => {
    expect(plan.issues.some((i) => i.kind === "status_disagree" && i.plate === "ABC1234")).toBe(true);
    expect(plan.issues.some((i) => i.kind === "odd_date")).toBe(true);
    expect(plan.units.find((u) => u.plate_no === "ABC1234")?.arrival_date).toBeNull();
  });
  it("imports a blank classification as legacy, keeps the written text and reads the handoff step", () => {
    expect(plan.units[1].fields.classification).toBe("Not classified (legacy)");
    expect(plan.units[0].fields.cr).toBe("Yes");
    expect(plan.events).toHaveLength(1);
  });
  it("balances every column: each cell is in the database or set aside on purpose", () => {
    expect(plan.balance.every((b) => b.ok)).toBe(true);
    expect(plan.balance.find((b) => b.column === "REMARKS II")).toMatchObject({ sourceCells: 1, inDatabase: 0, setAside: 1 }); // the #REF!
  });
  it("stops when the sheet layout changed", () => {
    expect(() => planImport({ snapshot: "t", sha256: "x", takenAt: "", tabs: { "DOCS 2026": { hidden: false, maxRow: 1, maxCol: 3, cells: [cell(1, 2, "SOMETHING")] } } })).toThrow(/layout changed/);
  });
});
