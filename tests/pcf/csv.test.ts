import { describe, expect, it } from "vitest";

import { toCsv } from "@/lib/pcf/csv";

describe("toCsv", () => {
  it("joins header and rows with CRLF", () => {
    const csv = toCsv(["Name", "Amount"], [["Office Supplies", 100.5]]);
    expect(csv).toBe("Name,Amount\r\nOffice Supplies,100.5");
  });

  it("quotes and escapes fields containing commas, quotes, or newlines", () => {
    const csv = toCsv(["Note"], [['Said "hello", then left\nnext line']]);
    expect(csv).toBe('Note\r\n"Said ""hello"", then left\nnext line"');
  });

  it("keeps numeric amounts as plain numbers", () => {
    const csv = toCsv(["Amount"], [[1000], [0.5]]);
    expect(csv).toBe("Amount\r\n1000\r\n0.5");
  });
});

describe('formula injection', () => {
  it('neutralises cells that spreadsheets would run as formulas', () => {
    const out = toCsv(['Payee', 'Amount'], [['=HYPERLINK("http://evil","x")', 5], ['+1+1', -20], ['@SUM(A1)', 1], ['-cmd', 2], ['Normal', 3]]);
    expect(out).toContain(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(out).toContain(`'+1+1,-20`);
    expect(out).toContain(`'@SUM(A1)`);
    expect(out).toContain(`'-cmd`);
    expect(out).toContain('Normal,3');
  });
});
