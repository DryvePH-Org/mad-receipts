import { expect, test } from "@playwright/test";
import { credentials } from "./support";

test("Users: adding a person is behind a button, and the page offers disable and access controls", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials.admin.email);
  await page.getByLabel("Password").fill(credentials.admin.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/deals");
  await page.goto("/admin/users");
  await expect(page.getByText(/^All users/)).toBeVisible({ timeout: 30_000 });
  // the form is not on the page until the button is pressed
  await expect(page.getByLabel("Temporary password")).toHaveCount(0);
  await page.getByRole("button", { name: "Add a user" }).click();
  await expect(page.getByRole("dialog").getByLabel("Temporary password")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // you cannot disable yourself, but you can disable others
  await expect(page.getByRole("button", { name: "Disable" }).first()).toBeVisible();
  // per-person access (shown once the latest database update is applied)
  const access = page.getByRole("button", { name: /^Access/ }).first();
  if (await access.count()) {
    await access.click();
    await expect(page.getByRole("dialog").getByText("Cannot open").first().or(page.getByRole("dialog").getByText("Can open").first())).toBeVisible();
    await expect(page.getByRole("dialog").getByText("powerful").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Review the change…" })).toBeDisabled(); // nothing changed yet
  }
  await page.close();
});

test("Settings → Delete data: each button needs its exact words (nothing is deleted here)", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials.admin.email);
  await page.getByLabel("Password").fill(credentials.admin.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/deals");
  await page.goto("/settings");
  await page.getByRole("tab", { name: "Delete data" }).click();
  await expect(page.getByText("Deleted data cannot be brought back.")).toBeVisible();
  await page.getByRole("button", { name: "Delete all transactions…" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Type DELETE ALL TRANSACTIONS/).fill("delete all transactions");
  await dialog.getByRole("button", { name: "Delete all transactions", exact: true }).click();
  await expect(dialog.getByText(/Type DELETE ALL TRANSACTIONS exactly/)).toBeVisible(); // wrong words: refused, and nothing is deleted
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.close();
});

test("Sync jobs: the page lists the jobs of the app, and there is no sheet replay any more", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials.admin.email);
  await page.getByLabel("Password").fill(credentials.admin.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/deals");
  await page.goto("/admin/sync");
  await expect(page.getByRole("heading", { name: "Sync jobs" })).toBeVisible();
  await expect(page.getByText(/saves the audit copy in Drive and tells Telegram/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay to the live sheets" })).toHaveCount(0);
  await page.close();
});

test("Settings → Print and company: the print layout editor shows the real paper and updates as you type", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials.admin.email);
  await page.getByLabel("Password").fill(credentials.admin.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/deals");
  await page.goto("/settings");
  await page.getByRole("tab", { name: "Print and company" }).click();
  await expect(page.getByText("Live preview")).toBeVisible();
  await expect(page.locator(".paper.ack").getByText("ACKNOWLEDGEMENT OF PAYMENT", { exact: false })).toBeVisible();
  await page.getByLabel("Business name").fill("Preview Motors"); // typing only: nothing is saved until the box is left
  await expect(page.locator(".paper.ack h1")).toHaveText("Preview Motors");
  await page.getByLabel("Title of the form").fill("Receipt of Payment");
  await expect(page.locator(".paper.ack h2")).toHaveText("Receipt of Payment");
  await expect(page.getByRole("radio", { name: "Full A4" })).toHaveCount(0); // one print view only: the half page
  await page.close();
});

test("Users: a new person needs the password twice (with an eye to check it), and a person with no history can be removed", async ({ browser }) => {
  const email = "zzt-e2e-newhire@example.test";
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials.admin.email);
  await page.getByLabel("Password").fill(credentials.admin.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/deals");
  await page.goto("/admin/users");
  await expect(page.getByText(/^All users/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Add a user" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Full name").fill("ZZT E2E New Hire");
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Temporary password").fill("Newhire-pass-1");
  await dialog.getByLabel("Confirm password").fill("Newhire-pass-2");
  // the eye shows what was typed
  await expect(dialog.locator("#password")).toHaveAttribute("type", "password");
  await dialog.getByRole("button", { name: "Show the password" }).first().click();
  await expect(dialog.locator("#password")).toHaveAttribute("type", "text");
  await dialog.getByRole("button", { name: "Create user" }).click();
  await expect(dialog.getByText("The two passwords are not the same.")).toBeVisible();
  await dialog.getByLabel("Confirm password").fill("Newhire-pass-1");
  await dialog.getByRole("button", { name: "Create user" }).click();
  const row = page.locator("li", { hasText: email });
  await expect(row).toBeVisible({ timeout: 30_000 });
  // removing asks first; Cancel keeps the person
  await row.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Yes, remove this account" }).click();
  await expect(page.locator("li", { hasText: email })).toHaveCount(0, { timeout: 30_000 });
  await page.close();
});
