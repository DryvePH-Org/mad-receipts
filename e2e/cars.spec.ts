import { expect, test, type Browser, type Page } from "@playwright/test";
import { credentials } from "./support";

// The Car Inventory dashboard, reading the app's own price list (the database).

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

test("every role can open Car Inventory, search and filter it", async ({ browser }) => {
  const sales = await as(browser, "marketing"); // Online Marketing look only: no target price, no bank
  await expect(sales.getByRole("link", { name: "Car Inventory" }).first()).toBeVisible();
  await sales.goto("/cars");
  await expect(sales.getByRole("heading", { name: "Car Inventory" })).toBeVisible();
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

  // the details window: Online Marketing never see the target price or the bank
  await sales.locator("tbody tr").first().click();
  await expect(sales.getByRole("dialog")).toBeVisible();
  await expect(sales.getByRole("dialog").getByText("Target")).toHaveCount(0);
  await expect(sales.getByRole("dialog").getByText("Encumbered to")).toHaveCount(0);
  await sales.keyboard.press("Escape");

  // the approver does see the target price
  const approver = await as(browser, "approver");
  await approver.goto("/cars");
  await expect(approver.getByText(/^Showing \d+ of \d+ cars/)).toBeVisible({ timeout: 40_000 });
  await approver.getByRole("button", { name: "Table" }).click();
  await approver.locator("tbody tr").first().click();
  await expect(approver.getByRole("dialog").getByText("Target")).toBeVisible();
  await expect(approver.getByRole("dialog").getByText("Encumbered to")).toBeVisible();
  // Sales change the price list, so they see all of it
  const seller = await as(browser, "sales");
  await seller.goto("/cars");
  await expect(seller.getByText(/^Showing \d+ of \d+ cars/)).toBeVisible({ timeout: 40_000 });
  await seller.getByRole("button", { name: "Table" }).click();
  await seller.locator("tbody tr").first().click();
  await expect(seller.getByRole("dialog").getByText("Target")).toBeVisible();
  await seller.close();
  await sales.close(); await approver.close();
});

test("Car Inventory is also on the documentation staff's menu", async ({ browser }) => {
  const docs = await as(browser, "docs");
  await docs.goto("/cars");
  await expect(docs.getByRole("heading", { name: "Car Inventory" })).toBeVisible();
  await expect(docs.getByText(/^Showing \d+ of \d+ cars/)).toBeVisible({ timeout: 40_000 });
  await docs.close();
});

test("the Admin's go-live check runs and reports on the settings, the database and the price list", async ({ browser }) => {
  const admin = await as(browser, "admin");
  await admin.goto("/admin/golive");
  await expect(admin.getByRole("heading", { name: "Go-live check" })).toBeVisible();
  await admin.getByRole("button", { name: "Run the checks" }).click();
  await expect(admin.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 90_000 });
  await expect(admin.getByRole("heading", { name: "Database", exact: true })).toBeVisible();
  await expect(admin.getByRole("heading", { name: "Car Inventory (database)" })).toBeVisible();
  await expect(admin.getByText("Cars in Car Inventory")).toBeVisible();
  await expect(admin.getByRole("heading", { name: "Car documents (database)" })).toBeVisible();
  await expect(admin.getByRole("heading", { name: "Cut-over" })).toBeVisible(); // the old sheet is checked for changes made after the move
  await admin.close();

  // nobody else can open it
  const sales = await as(browser, "sales");
  await sales.goto("/admin/golive");
  await expect(sales.getByText("You don't have access to this page.")).toBeVisible();
  await sales.close();
});

test("the car record: the same sections for every car, details edited by the Admins in one standard format (nothing is saved here)", async ({ browser }) => {
  const admin = await as(browser, "approver"); // the Admin role
  await admin.goto("/cars");
  await expect(admin.getByText(/^Showing \d+ of \d+ cars/)).toBeVisible({ timeout: 40_000 });
  await admin.getByRole("button", { name: "Table" }).click();
  await admin.locator("tbody tr").first().click();
  const dialog = admin.getByRole("dialog");
  for (const section of ["Who the car is", "Status and price", "Where it is", "Papers"]) await expect(dialog.getByRole("heading", { name: section })).toBeVisible();
  for (const label of ["Model (year)", "Brand", "Make", "Color", "Body type", "Transmission", "Fuel", "Mileage", "Spare key"]) await expect(dialog.getByText(label, { exact: true }).first()).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Edit status and price" })).toBeVisible();

  // the details form: pick lists for the closed sets, the way it will be saved shown while typing
  await dialog.getByRole("button", { name: "Edit details" }).click();
  await expect(dialog.getByLabel("Transmission").locator("option")).toContainText(["(not set)", "AT", "MT", "CVT"]);
  await expect(dialog.getByLabel("Fuel").locator("option")).toContainText(["(not set)", "GAS", "DIESEL", "GAS - HYBRID", "ELECTRIC", "PH EV"]);
  await dialog.getByLabel("Mileage").fill("45T KMS");
  await expect(dialog.getByText("45,000 KM")).toBeVisible();
  await dialog.getByLabel("Mileage").fill("lots");
  await expect(dialog.getByText("Type the mileage in km, like 45000.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save the details" })).toBeDisabled();
  await dialog.getByLabel("Model (year)").fill("2019");
  await dialog.getByRole("button", { name: "Cancel" }).click(); // nothing was saved
  await expect(dialog.getByRole("button", { name: "Edit details" })).toBeVisible();
  await admin.keyboard.press("Escape");

  // the Tidy up list is for the Admins
  await admin.goto("/cars/tidy");
  await expect(admin.getByRole("heading", { name: "Tidy up the car details" })).toBeVisible();
  await admin.close();

  // Sales change status and price, not the details; Online Marketing change nothing; neither opens the tidy list
  const sales = await as(browser, "sales");
  await sales.goto("/cars");
  await expect(sales.getByText(/^Showing \d+ of \d+ cars/)).toBeVisible({ timeout: 40_000 });
  await sales.getByRole("button", { name: "Table" }).click();
  await sales.locator("tbody tr").first().click();
  await expect(sales.getByRole("dialog").getByRole("button", { name: "Edit status and price" })).toBeVisible();
  await expect(sales.getByRole("dialog").getByRole("button", { name: "Edit details" })).toHaveCount(0);
  await sales.goto("/cars/tidy");
  await expect(sales.getByText("You don't have access to this page.")).toBeVisible();
  await sales.close();
  const viewer = await as(browser, "marketing");
  await viewer.goto("/cars");
  await expect(viewer.getByText(/^Showing \d+ of \d+ cars/)).toBeVisible({ timeout: 40_000 });
  await viewer.getByRole("button", { name: "Table" }).click();
  await viewer.locator("tbody tr").first().click();
  await expect(viewer.getByRole("dialog").getByRole("button", { name: /^Edit / })).toHaveCount(0);
  await viewer.close();
});
