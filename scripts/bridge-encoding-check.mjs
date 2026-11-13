// Writes known tricky values into a TEST tab through the gateway and reads them back, to prove nothing is changed on the way
// (numbers turned into dates, leading zeros lost, formulas run, accents or emoji broken...). It adds rows to the test tab; it never deletes.
//
// Usage:  BRIDGE_TEST_SHEET_ID=<a test spreadsheet> node scripts/bridge-encoding-check.mjs [--tab "BRIDGE TEST"]
// The tab must already exist in that spreadsheet and the sheet must be on the gateway's allow-list. It refuses the app's real sheets.
import { readFileSync, existsSync } from "node:fs";

const env = { ...process.env };
if (existsSync(".env.local")) for (const l of readFileSync(".env.local", "utf8").split("\n")) { const m = /^([A-Z_0-9]+)=(.*?)(\s+#.*)?$/.exec(l); if (m && !(m[1] in env)) env[m[1]] = m[2].trim(); }
const url = env.BRIDGE_URL || env.APPS_SCRIPT_URL, secret = env.BRIDGE_SECRET || env.APPS_SCRIPT_SECRET;
const sheet = env.BRIDGE_TEST_SHEET_ID;
const tab = process.argv.includes("--tab") ? process.argv[process.argv.indexOf("--tab") + 1] : env.BRIDGE_TEST_TAB || "BRIDGE TEST";
if (!url || !secret) { console.error("Set BRIDGE_URL and BRIDGE_SECRET (or APPS_SCRIPT_URL and APPS_SCRIPT_SECRET)."); process.exit(2); }
if (!sheet) { console.error("Set BRIDGE_TEST_SHEET_ID to a TEST spreadsheet (never the real one)."); process.exit(2); }
for (const k of ["INVENTORY_SHEET_ID", "GOOGLE_SHEET_ID", "DASHBOARD_BUY_SHEET_ID", "DASHBOARD_SELL_SHEET_ID"]) {
  if (env[k] && env[k] === sheet) { console.error(`Refusing: BRIDGE_TEST_SHEET_ID is the same as ${k}. Use a separate test spreadsheet.`); process.exit(2); }
}

const call = async (action, params) => {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret, action, ...params }), redirect: "follow", signal: AbortSignal.timeout(60_000) });
  const j = await res.json().catch(() => null);
  if (!j?.ok) throw new Error(`${action}: ${j?.message ?? "no answer"}${j?.code ? ` (${j.code})` : ""}`);
  return j.data;
};
const q = `'${tab.replace(/'/g, "''")}'`;
const run = `RUN${Date.now().toString(36).toUpperCase()}`;

// every value is sent as text exactly as the app would send it, and must come back as the same text
const CASES = [
  ["plain text", "Maria Santos"],
  ["receipt number", "2556"],
  ["leading zeros", "09171234567"],
  ["plate", "NBU 4875"],
  ["plate no space", "NBU4875"],
  ["iso date", "2026-11-02"],
  ["short date as staff write it", "11/2"],
  ["fraction look-alike", "1/2"],
  ["formula", "=SUM(1,2)"],
  ["leading plus", "+639171234567"],
  ["leading minus", "-5"],
  ["at sign", "@handle"],
  ["leading apostrophe", "'quoted"],
  ["true", "true"],
  ["FALSE", "FALSE"],
  ["scientific look-alike", "1e5"],
  ["number-like with zeros", "00123"],
  ["inventory status text", "RESERVED - DAVID 11/2 10%"],
  ["peso sign", "₱1,234.50"],
  ["accents and symbols", "Ñandú — café ñ ü"],
  ["japanese", "日本語のテスト"],
  ["emoji", "✅ OK 😀"],
  ["quotes and separators", 'He said "hi", a;b,c'],
  ["line break", "line1\nline2"],
  ["spaces kept", "  padded  "],
  ["long text", "x".repeat(900)],
];

let bad = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`); if (!ok) bad++; };
const show = (v) => JSON.stringify(v).slice(0, 80);

try {
  await call("sheets.get", { spreadsheetId: sheet, range: q }); // the tab exists and is allowed
} catch (e) { console.error(`Cannot read the test tab ${q}: ${e.message}\nCreate the tab in the test spreadsheet and put the spreadsheet on the gateway's allow-list.`); process.exit(2); }

// 1. append: each case on its own row, the value in column B, the run marker in A
await call("sheets.append", { spreadsheetId: sheet, range: q, values: CASES.map(([name, value], i) => [`${run}-${i}`, value, name]) });
let rows = await call("sheets.get", { spreadsheetId: sheet, range: q });
const at = (i) => rows.findIndex((r) => r[0] === `${run}-${i}`);
CASES.forEach(([name, value], i) => {
  const r = at(i);
  const got = r < 0 ? undefined : rows[r][1] ?? "";
  // a space at either end may be trimmed by a sheet on display; the rest must match exactly
  const same = got === value || (value.trim() !== value && got === value.trim() && "trimmed");
  check(`append keeps ${name}`, same === true || same === "trimmed", same === "trimmed" ? "(edge spaces trimmed on display)" : same ? "" : `sent ${show(value)} got ${show(got)}`);
});

// 2. a number stays a number
await call("sheets.append", { spreadsheetId: sheet, range: q, values: [[`${run}-num`, 1500.5, "number"]] });
rows = await call("sheets.get", { spreadsheetId: sheet, range: q });
const numRow = rows.find((r) => r[0] === `${run}-num`);
check("append keeps a number as a number", numRow && Number(String(numRow[1]).replace(/,/g, "")) === 1500.5, show(numRow?.[1]));

// 3. update one cell: only that cell changes
const target = at(1) + 1; // the sheet row (1-based) holding the receipt number case
const before = rows[at(1)].slice();
await call("sheets.update", { spreadsheetId: sheet, range: `${q}!D${target}`, values: [["updated 2026-11-02"]] });
rows = await call("sheets.get", { spreadsheetId: sheet, range: q });
const after = rows[at(1)];
check("update writes the one cell", after?.[3] === "updated 2026-11-02", show(after?.[3]));
check("update leaves the other cells alone", after?.[0] === before[0] && after?.[1] === before[1] && after?.[2] === before[2]);

// 4. rows above are untouched and nothing was inserted
check("rows are not inserted or reordered", at(0) >= 0 && at(0) + 1 === at(1) && at(1) + 1 === at(2));

console.log(bad ? `\n${bad} check(s) failed. Fix the gateway's writing, then run this again.` : `\nAll encoding checks passed (rows tagged ${run} were added to the test tab).`);
process.exit(bad ? 1 : 0);
