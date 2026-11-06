import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Petty cash database tests (tests/pcf with RUN_DB_TESTS): vouchers, replenishments, row-level security and the RPCs,
// against the TEST Supabase project in .env.test.local (ref ggwdtwmudicvzgpjejtu), seeded with supabase/pcf-test-seed.sql.
// Refuses to run unless that file names the test project, so the live project is never touched.
const env: Record<string, string> = {};
for (const line of readFileSync(".env.test.local", "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line);
  if (m) env[m[1]] = m[2].trim();
}
if (!env.SUPABASE_TEST_PROJECT_REF || !env.NEXT_PUBLIC_SUPABASE_URL?.includes(env.SUPABASE_TEST_PROJECT_REF)) {
  throw new Error(".env.test.local must point at the test project (SUPABASE_TEST_PROJECT_REF).");
}

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path("./src"),
      "server-only": path("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/pcf/**/*.test.ts"],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
      RUN_DB_TESTS: "true",
    },
    // The tests share one fund, so files run one after another.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
