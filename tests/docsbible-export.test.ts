import { describe, expect, it } from "vitest";
import { backupName, exportHeader, exportRow, toCsv } from "../src/lib/docsbible/export";

describe("the sheet-layout export", () => {
  it("puts every header word where the sheet had it", () => {
    const h = exportHeader();
    expect(h).toHaveLength(42);
    expect(h[11]).toBe("PLATE NO."); // L
    expect(h[2]).toBe("CATEGORY"); // C
    expect(h[26]).toBe("COMPLETE DOCS?");
    expect(h[27]).toBe("CR");
    expect(h[41]).toBe("REMARKS II"); // AP
    expect(h[0]).toBe(""); expect(h[1]).toBe(""); expect(h[22]).toBe("VEHICLE STATUS"); expect(h[23]).toBe("CLASSIFICATION"); expect(h[21]).toBe(""); // A, B and V have no header
  });
  it("fills a car's row, with the plate copied into column A and the computed COMPLETE", () => {
    const r = exportRow({ plate_display: "NGR 7902", make: "TOYOTA", cr: "Yes", remarks_1: "line 1\nline 2" }, "COMPLETE");
    expect(r[0]).toBe("NGR 7902"); expect(r[11]).toBe("NGR 7902"); expect(r[5]).toBe("TOYOTA"); expect(r[27]).toBe("Yes"); expect(r[26]).toBe("COMPLETE");
    expect(r[40]).toBe("line 1\nline 2");
  });
  it("quotes commas, quotes and line breaks, and starts with a byte order mark", () => {
    const csv = toCsv([["a", 'b,"c"', "d\ne"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('a,"b,""c""","d\ne"');
  });
  it("names the saved copy by day", () => { expect(backupName("2026-11-18")).toBe("docs-bible-2026-11-18.csv"); });
});
