import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests against the HOSTED Supabase project, used while it holds no real data. They write only
// clearly marked test rows (receipts "ZZT-HOSTED…", users "zzt-hosted-…") and clean up before and after.
// Refuses to run unless ALLOW_HOSTED_TESTS=yes, so it is never started by accident.
if (process.env.ALLOW_HOSTED_TESTS !== "yes") {
  throw new Error("Hosted tests are off. Run: ALLOW_HOSTED_TESTS=yes npm run test:hosted");
}

const env: Record<string, string> = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*?)(\s+#.*)?$/.exec(line);
  if (m) env[m[1]] = m[2].trim();
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
    include: ["tests/hosted/**/*.test.ts"],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    },
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
