import { beforeEach, describe, expect, it, vi } from "vitest";

const csv = vi.hoisted(() => ({ text: "" }));
vi.mock("@/lib/dashboard/sheets", () => ({ fetchText: async () => csv.text, listTabInfo: async () => [{ name: "DOCS 2026", gid: "0" }], SheetError: class extends Error {}, withFallback: async (_k: string, f: () => Promise<unknown>) => ({ value: await f(), at: 0, stale: false }) }));

import { readBibleRowFast } from "@/lib/docs/bible-read";

const HEAD = "PLATE NO.,DATE ARRIVAL,CLASSIFICATION,CR,OR,DEED OF SALE,SELLER'S ID,SEC CERT,SEC ID'S,BOARDS RESO,Encumbered,CHATTEL,PROMISSORY,REMARKS I,COMPLETE DOCS?";
const row = (plate: string, arrival: string, cls = "", cr = "") => `${plate},${arrival},${cls},${cr},,,,,,,,,,,`;
let n = 0;
const read = (plate: string, lines: string[], head = HEAD) => { csv.text = [head, ...lines].join("\n"); return readBibleRowFast(plate, `sheet-${++n}`, "DOCS 2026", Date.now()); };

describe("reading a unit's row straight from the exported tab", () => {
  beforeEach(() => { csv.text = ""; });
  it("finds the unit by plate, with its row number (the header is row 1) and its checklist values", async () => {
    const r = await read("NBU 4875", [row("AAA1111", "9/1/26"), row("NBU4875", "9/12/26", "Clean", "Yes")]);
    expect(r).toMatchObject({ found: true, matches: 1, row: 3, arrival: "2026-09-12", values: { classification: "Clean", cr: "Yes", or: "" } });
  });
  it("takes the row with the latest arrival when a plate is there twice (a unit bought back)", async () => {
    const r = await read("NCI3415", [row("NCI3415", "1/17/26", "Clean", "Yes"), row("NCI3415", "9/22/26")]);
    expect(r).toMatchObject({ found: true, matches: 2, row: 3, arrival: "2026-09-22", values: { classification: "" } });
  });
  it("refuses two rows that arrived on the same day, and a plate that is not there is simply not found", async () => {
    await expect(read("NCI3415", [row("NCI3415", "9/22/26"), row("NCI3415", "9/22/26")])).rejects.toThrow(/same day/);
    expect(await read("ZZZ9999", [row("AAA1111", "9/1/26")])).toMatchObject({ found: false, matches: 0, row: null });
  });
  it("says which columns are missing instead of guessing", async () => {
    await expect(read("AAA1111", [row("AAA1111", "9/1/26")], "PLATE NO.,DATE ARRIVAL,CR")).rejects.toThrow(/CLASSIFICATION/);
  });
  it("refuses an unreadable page (a sheet that is not shared by link)", async () => {
    csv.text = "<!DOCTYPE html><html></html>";
    await expect(readBibleRowFast("AAA1111", `sheet-${++n}`, "DOCS 2026", Date.now())).rejects.toThrow(/not readable by link/);
  });
});
