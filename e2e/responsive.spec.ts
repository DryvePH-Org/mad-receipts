import { expect, test, type Page } from "@playwright/test";
import { credentials } from "./support";

// Every module at phone, tablet and laptop width: nothing may push the page sideways (wide tables scroll inside their own box),
// and on a phone the New receipt page must not lose its first field under an oversized button bar.
const SIZES = [{ name: "phone", width: 375, height: 812 }, { name: "tablet", width: 768, height: 1024 }, { name: "laptop", width: 1280, height: 800 }];
const PAGES: [keyof typeof credentials, string, number][] = [
  ["admin", "/deals", 800], ["admin", "/new", 800], ["admin", "/approvals", 800], ["admin", "/reminders", 800], ["admin", "/cash", 800], ["admin", "/activity", 800],
  ["admin", "/settings", 800], ["admin", "/admin/users", 800], ["admin", "/admin/sync", 800], ["admin", "/documents", 800], ["sales", "/upload-documents", 800],
  ["admin", "/dashboard/buy", 5000], ["admin", "/dashboard/sell", 5000],
];

async function login(page: Page, who: keyof typeof credentials) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials[who].email);
  await page.getByLabel("Password").fill(credentials[who].password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/deals");
}

test("no page scrolls sideways at any size", async ({ browser }) => {
  test.setTimeout(600_000);
  const problems: string[] = [];
  for (const size of SIZES) {
    const pages: Partial<Record<keyof typeof credentials, Page>> = {};
    for (const [who, path, wait] of PAGES) {
      if (!pages[who]) { pages[who] = await (await browser.newContext({ viewport: size })).newPage(); await login(pages[who]!, who); }
      const page = pages[who]!;
      await page.goto(path);
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await page.waitForTimeout(wait);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (over > 1) problems.push(`${size.name} ${path}: ${over}px too wide`);
    }
  }
  expect(problems).toEqual([]);
});

test("on a phone the receipt form keeps its steps and buttons compact", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  await login(page, "sales");
  await page.goto("/new");
  const steps = await page.getByRole("list", { name: "Steps" }).boundingBox();
  expect(steps!.height).toBeLessThan(90); // five small steps in one row, not five tall cards
  const bar = await page.getByRole("button", { name: /^Next/ }).locator("xpath=ancestor::div[contains(@class,'sticky')]").boundingBox();
  expect(bar!.height).toBeLessThan(84); // one row
  await expect(page.getByLabel("Receipt No.")).toBeVisible();
});
