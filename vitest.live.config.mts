import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests that call the REAL Groq API (voice and photo reading quality). They use your Groq quota and
// need network. Run: ALLOW_LIVE_TESTS=yes npm run test:live
if (process.env.ALLOW_LIVE_TESTS !== "yes") throw new Error("Live tests are off. Run: ALLOW_LIVE_TESTS=yes npm run test:live");

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
    env: { GROQ_API_KEY: env.GROQ_API_KEY, GROQ_VISION_MODEL: env.GROQ_VISION_MODEL, GROQ_TRANSCRIPTION_MODEL: env.GROQ_TRANSCRIPTION_MODEL ?? "" },
    fileParallelism: false,
    testTimeout: 120_000,
  },
});
