import type { CellValue, SheetsClient } from "@/lib/google/sheets";

/** A fake spreadsheet: named tabs as grids, plus a log of every call. */
export function fakeSheets(tabs: Record<string, CellValue[][]>) {
  const calls: { op: "get" | "update" | "append"; range: string; values?: CellValue[][] }[] = [];

  function parse(range: string) {
    const m = /^'((?:[^']|'')+)'(?:!([A-Z]+)(\d+)(?::[A-Z]+\d+)?)?$/.exec(range);
    if (!m) throw new Error(`fake sheets: bad range ${range}`);
    const tab = m[1].replace(/''/g, "'");
    if (!tabs[tab]) throw Object.assign(new Error(`Unable to parse range: ${range}`), { code: 400 });
    const col = m[2] ? m[2].split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1 : 0;
    const row = m[3] ? Number(m[3]) - 1 : 0;
    return { grid: tabs[tab], col, row };
  }

  const client: SheetsClient = {
    async getValues(_id, range) {
      calls.push({ op: "get", range });
      return parse(range).grid.map((r) => r.map(String));
    },
    async updateValues(_id, range, values) {
      calls.push({ op: "update", range, values });
      const { grid, col, row } = parse(range);
      values.forEach((vals, i) => {
        grid[row + i] ??= [];
        vals.forEach((v, j) => (grid[row + i][col + j] = v));
      });
    },
    async appendValues(_id, range, values) {
      calls.push({ op: "append", range, values });
      parse(range).grid.push(...values.map((r) => [...r]));
    },
  };
  return { tabs, calls, client };
}
