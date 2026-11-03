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
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**", "tests/hosted/**", "tests/live/**", "node_modules/**"], // need a database or the real Groq API: npm run test:integration / test:hosted / test:live
  },
});
