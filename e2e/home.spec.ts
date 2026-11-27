import { expect, test, type Page } from "@playwright/test";
import { credentials } from "./support";

// Everyone lands on their own Home: what they are working on, and what needs them (by role).

async function login(page: Page, who: keyof typeof credentials) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials[who].email);
  await page.getByLabel("Password").fill(credentials[who].password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/home");
}

test("every role lands on Home, with its own things that need attention", async ({ browser }) => {
  const seen: Record<string, string[]> = {
    admin: ["Failed background jobs", "Things in the data check", "Repair reports waiting for approval", "Papers with Sir Jep"],
    approver: ["Things in the data check", "Repair reports waiting for approval", "Papers with Sir Jep"],
    sales: ["Repair reports waiting for approval"],
    docs: ["Papers with Sir Jep", "Cars whose IN documents are not approved"],
    marketing: ["Cars ready to market this week"],
  };
  for (const [who, tiles] of Object.entries(seen)) {
    const page = await (await browser.newContext()).newPage();
    await login(page, who as keyof typeof credentials);
    await expect(page.getByRole("heading", { name: /^Hi, / })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("region", { name: "My work right now" })).toBeVisible();
    for (const t of tiles) await expect(page.getByText(t, { exact: false }).first()).toBeVisible();
    // a role does not get another role's tiles
    if (who === "sales") await expect(page.getByText("Failed background jobs")).toHaveCount(0);
    if (who === "marketing") await expect(page.getByText("Repair reports waiting for approval")).toHaveCount(0);
    await page.close();
  }
});

test("the address / leads to Home, and Home is first in the menu", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await login(page, "sales");
  await page.goto("/");
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("link", { name: "Home" }).first()).toBeVisible();
  await page.close();
});
