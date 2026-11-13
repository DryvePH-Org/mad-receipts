import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path("./src"),
      "server-only": path("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    env: { SHEETS_WRITES: "on" }, // the tests write to fake sheets; the freeze itself is tested with its own setting
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/hosted/**", "tests/live/**", "node_modules/**"], // these need the real project or the real Groq API: npm run test:hosted / test:live
  },
});
