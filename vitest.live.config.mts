import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests that call REAL services with your keys: Groq (voice reading) and a read-only look at the inventory sheet.
// Nothing is saved or changed anywhere.
// Run: npm run test:live
const env: Record<string, string> = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*?)(\s+#.*)?$/.exec(line);
  if (m) env[m[1]] = m[2].trim();
}
const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": path("./src"), "server-only": path("./tests/stubs/server-only.ts") } },
  test: {
    include: ["tests/live/**/*.test.ts"],
    env, // everything in .env.local: Groq, and the Google / inventory settings for the read-only inventory check
    fileParallelism: false,
    testTimeout: 120_000,
  },
});
