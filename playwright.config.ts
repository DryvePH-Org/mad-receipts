import { defineConfig } from "@playwright/test";

// Browser tests: they start the app on port 3124 and use the hosted Supabase project with clearly
// marked test data (receipts "ZZT-E2E…", users "zzt-e2e-…") that is removed before and after.
// Google and Telegram are switched off, so nothing leaves the machine except Supabase.
const PORT = 3124;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: { baseURL: `http://localhost:${PORT}`, channel: "chrome", trace: "retain-on-failure" },
  webServer: [
    {
      command: `npx next dev -p ${PORT}`,
      port: PORT,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        APPS_SCRIPT_URL: "",
        APPS_SCRIPT_SECRET: "",
        TELEGRAM_BOT_TOKEN: "",
        TELEGRAM_CHAT_ID: "",
        INVENTORY_SHEET_ID: "",
      },
    },
  ],
});
