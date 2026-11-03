import { expect, test, type Page } from "@playwright/test";
import { credentials, PHOTO, RECEIPT_PREFIX, setMockGroq } from "./support";

async function login(page: Page, who: keyof typeof credentials) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials[who].email);
  await page.getByLabel("Password").fill(credentials[who].password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/");
}

/** Uploads the sample photo and waits for the review screen to be ready. */
async function uploadPhoto(page: Page) {
  await page.goto("/upload");
  await page.waitForLoadState("networkidle"); // the page must be interactive before a file is chosen
  await page.locator('input[type="file"]').last().setInputFiles(PHOTO);
  await page.getByRole("button", { name: "Use photo" }).click();
  await page.waitForURL("**/review/**");
}

test.describe.configure({ mode: "serial" });

test("a wrong password is refused with a clear message", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials.staff.email);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Wrong email or password.")).toBeVisible();
});

test("logged-out visitors are sent to the login page", async ({ page }) => {
  await page.goto("/deals");
  await expect(page).toHaveURL(/\/login/);
});

test("staff cannot open the admin pages and do not see them in the menu", async ({ page }) => {
  await login(page, "staff");
  await page.goto("/admin/users");
  await expect(page.getByText("Admins only")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create staff user" })).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Audit log" })).toHaveCount(0);
});

test("photo to confirmed receipt, then it shows on the deal; the same number is refused", async ({ page }) => {
  const no = `${RECEIPT_PREFIX}-${Date.now() % 100000}`;
  await setMockGroq({ down: false, receipt_no: no, plate_no: "NKF4771", amount: 100000 });
  await login(page, "staff");

  await uploadPhoto(page);
  await expect(page.getByLabel("Receipt No.")).toHaveValue(no);
  await expect(page.getByLabel("Plate No.")).toHaveValue("NKF4771");
  await expect(page.getByLabel("Received from")).toHaveValue("ZZT E2E Buyer");

  await page.getByRole("button", { name: "Confirm receipt" }).click();
  await expect(page.getByText(`Receipt No. ${no} saved`)).toBeVisible();
  await page.getByText("View deal").click();
  await page.waitForURL("**/deals/**");
  await expect(page.getByText("NKF4771").first()).toBeVisible();
  await expect(page.getByText(no).first()).toBeVisible();

  // The same receipt number again must not be saved twice.
  await uploadPhoto(page);
  await expect(page.getByLabel("Receipt No.")).toHaveValue(no);
  await expect(page.getByText(/Adding to existing deal/)).toBeVisible(); // the unit and deal lookup is done
  const warned = page.getByLabel(/I checked the/);
  await warned.check(); // a second payment on the same car carries a warning
  await page.getByRole("button", { name: "Confirm receipt" }).click();
  await expect(page.getByText(/already saved/i)).toBeVisible();
});

test("when the AI service is down the form can still be filled by hand", async ({ page }) => {
  await setMockGroq({ down: true });
  await login(page, "staff");
  await uploadPhoto(page);
  await expect(page.getByText(/Type the details from the paper/i)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel("Receipt No.")).toBeEditable();
  await setMockGroq({ down: false });
});

test("admin pages open for an admin", async ({ page }) => {
  await login(page, "admin");
  for (const [path, heading] of [["/admin/users", "Users"], ["/admin/salespeople", "Salespeople"], ["/admin/audit", "Audit log"], ["/admin/sync", "Sync jobs"]]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
  }
});

test("the salesperson form checks input before sending and then adds the person", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/admin/salespeople");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add salesperson" }).click();
  await expect(page.getByText("Enter the name.")).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("ZZT E2E Sam");
  await page.getByLabel(/Nicknames/).fill("Sammy");
  await page.getByRole("button", { name: "Add salesperson" }).click();
  await expect(page.getByText("ZZT E2E Sam").first()).toBeVisible();
});

for (const [name, width, height] of [["phone", 390, 800], ["tablet", 820, 1100], ["desktop", 1366, 800]] as const) {
  test(`no button's content spills outside the button (${name})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await login(page, "staff");
    for (const path of ["/", "/upload", "/deals", "/receipts"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const spilled = await page.evaluate(() =>
        [...document.querySelectorAll("button, a[data-slot=button]")]
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .filter((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
          .map((el) => (el.textContent ?? "").trim().slice(0, 40) || el.getAttribute("aria-label")),
      );
      expect(spilled, `${path} at ${name}`).toEqual([]);
    }
    if (name === "tablet") {
      await page.goto("/upload");
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: "test-results/upload-tablet.png" });
    }
  });
}

test("dark mode can be switched on and stays after a reload", async ({ page }) => {
  await login(page, "staff");
  await page.getByRole("button", { name: /dark mode/i }).first().click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
