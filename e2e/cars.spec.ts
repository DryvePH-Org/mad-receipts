import { expect, test, type Browser, type Page } from "@playwright/test";
import { credentials } from "./support";

// The Car status dashboard, reading the MAD Pricelist copy (shared "Anyone with the link can view").

async function as(browser: Browser, who: keyof typeof credentials): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials[who].email);
  await page.getByLabel("Password").fill(credentials[who].password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/deals");
  return page;
}
const count = async (page: Page) => Number((await page.getByText(/^Showing \d+ of \d+ cars/).first().innerText()).match(/Showing (\d+) of (\d+)/)![1]);

test("every role can open Car status, search and filter it", async ({ browser }) => {
  const sales = await as(browser, "sales");
  await expect(sales.getByRole("link", { name: "Car status" }).first()).toBeVisible();
  await sales.goto("/cars");
  await expect(sales.getByRole("heading", { name: "Car status" })).toBeVisible();
  await expect(sales.getByText(/^Showing \d+ of \d+ cars/)).toBeVisible({ timeout: 40_000 });
  const all = await count(sales);
  expect(all).toBeGreaterThan(10);
  await expect(sales.getByText("Can be sold")).toBeVisible();

  // search narrows the list, clearing brings it back
  await sales.getByLabel("Search cars").fill("toyota");
  const some = await count(sales);
  expect(some).toBeGreaterThan(0);
  expect(some).toBeLessThan(all);
  await sales.getByRole("button", { name: "Clear filters" }).click();
  expect(await count(sales)).toBe(all);

  // a status chip filters, the table view shows the same cars
  await sales.getByRole("button", { name: /^Reserved \d+$/ }).click();
  const reserved = await count(sales);
  expect(reserved).toBeLessThan(all);
  await sales.getByRole("button", { name: "Table" }).click();
  await expect(sales.getByRole("columnheader", { name: "Plate" })).toBeVisible();
  expect(await sales.locator("tbody tr").count()).toBe(reserved);

  // the details window: Sales never see the target price or the bank
  await sales.locator("tbody tr").first().click();
  await expect(sales.getByRole("dialog")).toBeVisible();
  await expect(sales.getByRole("dialog").getByText("Target")).toHaveCount(0);
  await expect(sales.getByRole("dialog").getByText("Encumbrance")).toHaveCount(0);
  await sales.keyboard.press("Escape");

  // the approver does see the target price
  const approver = await as(browser, "approver");
  await approver.goto("/cars");
  await expect(approver.getByText(/^Showing \d+ of \d+ cars/)).toBeVisible({ timeout: 40_000 });
  await approver.getByRole("button", { name: "Table" }).click();
  await approver.locator("tbody tr").first().click();
  await expect(approver.getByRole("dialog").getByText("Target")).toBeVisible();
  await expect(approver.getByRole("dialog").getByText("Encumbrance")).toBeVisible();
  await sales.close(); await approver.close();
});

test("Car status is also on the documentation staff's menu", async ({ browser }) => {
  const docs = await as(browser, "docs");
  await docs.goto("/cars");
  await expect(docs.getByRole("heading", { name: "Car status" })).toBeVisible();
  await expect(docs.getByText(/^Showing \d+ of \d+ cars/)).toBeVisible({ timeout: 40_000 });
  await docs.close();
});
