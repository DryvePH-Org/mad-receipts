import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Server logs may hold ids, statuses and error codes, but never what is written on a receipt.
const SENSITIVE = /buyer|address|contact|phone|full_?name|email|password|token|secret|extraction|fields|transcript|payload|JSON\.stringify/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

describe("server logs", () => {
  it("never print personal or secret values", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles("src")) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (/console\.(log|info|warn|error|debug)\(/.test(line) && SENSITIVE.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
