import { defineConfig } from "@playwright/test";

// Browser tests: they start the app on port 3124 and use the hosted Supabase project with clearly
// marked test data (receipts "ZZT-E2E…", users "zzt-e2e-…") that is removed before and after.
// Google and Telegram are switched off, so nothing leaves the machine except Supabase.
const PORT = 3124;
// E2E_PROD=1 runs the tests against a production build (what the server runs) instead of the dev server: caching and prefetching differ.
const prod = !!process.env.E2E_PROD;

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
      command: prod ? `npx next build && npx next start -p ${PORT}` : `npx next dev -p ${PORT}`,
      port: PORT,
      timeout: prod ? 420_000 : 180_000,
      reuseExistingServer: false,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        APPS_SCRIPT_URL: "",
        APPS_SCRIPT_SECRET: "",
        TELEGRAM_BOT_TOKEN: "",
        TELEGRAM_CHAT_ID: "",
        INVENTORY_SHEET_ID: "",
        DOCS_MOCK: "1", // a stand-in Drive with a few car folders
        DOCS_FAKE_READER: "1", // the picture reader decides from the file name: nothing is sent to Groq
      },
    },
  ],
});
