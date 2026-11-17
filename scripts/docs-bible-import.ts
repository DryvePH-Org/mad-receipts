// Dry run of the Docs Bible import: reads a frozen snapshot, plans every row, and writes a plain report. It changes nothing anywhere
// (no database, no sheet). Usage:
//   npx jiti scripts/docs-bible-import.ts Docs/sheets-private/live-docs-bible.snapshot.json [report.md]
import { readFileSync, writeFileSync } from "node:fs";
import { planImport, type Snapshot } from "../src/lib/docsbible/import";

const [file, out = "Docs/sheets-private/import-report.md"] = process.argv.slice(2);
if (!file) { console.error("Usage: npx jiti scripts/docs-bible-import.ts <snapshot.json> [report.md]"); process.exit(2); }
const snap = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
const plan = planImport(snap);
const byKind = new Map<string, number>();
for (const i of plan.issues) byKind.set(i.kind, (byKind.get(i.kind) ?? 0) + 1);

const L: string[] = [];
L.push(`# Docs Bible import: dry run`, "", `Snapshot ${snap.snapshot} (sha256 ${snap.sha256.slice(0, 16)}…), taken ${snap.takenAt}. Nothing was written anywhere.`, "");
L.push("## Counts", "", ...Object.entries(plan.counts).map(([k, v]) => `- ${k}: ${v}`), "");
L.push("## Column balance (every non-empty source cell is in the database or set aside on purpose)", "", "| Column | Sheet | Goes to | Cells | In database | Set aside | Balanced |", "|---|---|---|---|---|---|---|");
for (const b of plan.balance) L.push(`| ${b.column} | ${b.letter} | ${b.target} | ${b.sourceCells} | ${b.inDatabase} | ${b.setAside} | ${b.ok ? "yes" : "NO"} |`);
L.push("", "## Not migrated as data, on purpose", "", ...plan.notMigrated.map((n) => `- ${n.tab}: ${n.what} (${n.count})`), "");
L.push("## For the staff to decide", "", ...[...byKind].map(([k, v]) => `- ${k}: ${v}`), "");
for (const kind of ["duplicate_plate", "no_plate", "status_disagree", "odd_date", "odd_plate", "unknown_value", "legacy_classification"]) {
  const list = plan.issues.filter((i) => i.kind === kind);
  if (!list.length) continue;
  L.push(`### ${kind} (${list.length})`, "", ...list.slice(0, 40).map((i) => `- row ${i.sourceRow}${i.plate ? ` ${i.plate}` : ""}: ${i.message}`), list.length > 40 ? `- … and ${list.length - 40} more` : "", "");
}
L.push("## Handoff events read from the text", "", `${plan.events.length} matched to a car, ${plan.unmatchedEvents.length} for a plate that is not in the register.`, "");
for (const e of plan.events.slice(0, 12)) L.push(`- ${e.plate} (${e.tab}): ${e.event} ${e.date ?? "no date"} ${e.person ?? ""} ← "${e.original.slice(0, 70)}"`);
writeFileSync(out, L.join("\n") + "\n");
const bad = plan.balance.filter((b) => !b.ok);
console.log(JSON.stringify(plan.counts), "unbalanced:", bad.length, "issues:", Object.fromEntries(byKind), "->", out);
