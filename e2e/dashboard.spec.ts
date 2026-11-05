import { expect, test, type Browser } from "@playwright/test";
import { credentials } from "./support";

// The Approver's dashboards read the team's real Google Sheets (shared "anyone with the link can view"), so these checks only look
// at the structure, never at particular numbers.
async function as(browser: Browser, who: keyof typeof credentials) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials[who].email);
  await page.getByLabel("Password").fill(credentials[who].password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/deals");
  return page;
}

test("the Approver sees the Buy and Sell dashboards; Sales and Documentation do not", async ({ browser }) => {
  const approver = await as(browser, "approver");
  await approver.getByRole("link", { name: "Dashboard" }).click();
  await expect(approver.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(approver).toHaveURL(/\/dashboard\/buy/);
  for (const title of ["For purchase today", "Hold (pending)", "MAD Bank", "Payables", "Scoreboard", "Monthly purchase history"]) await expect(approver.getByText(new RegExp(`^${title.replace(/[()]/g, "\\$&")}`)).first()).toBeVisible({ timeout: 60_000 });
  await approver.getByRole("link", { name: "Sell / Online marketing" }).click();
  for (const title of ["Sales as of today", "Accumulated pending sales", "Reserves", "Scoreboard", "Sales history"]) await expect(approver.getByText(new RegExp(`^${title.replace(/[()]/g, "\\$&")}`)).first()).toBeVisible({ timeout: 60_000 });
  await approver.getByRole("button", { name: "Refresh now" }).click();
  await expect(approver.getByText(/Refreshed/)).toBeVisible({ timeout: 30_000 });
  await approver.close();

  for (const who of ["sales", "docs"] as const) {
    const page = await as(browser, who);
    await expect(page.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
    await page.goto("/dashboard/buy");
    await expect(page.getByText("You don't have access to this page.")).toBeVisible();
    await page.close();
  }
  const admin = await as(browser, "admin");
  await admin.goto("/dashboard/sell");
  await expect(admin.getByText(/^Accumulated pending sales/).first()).toBeVisible({ timeout: 60_000 });
  await admin.close();
});
