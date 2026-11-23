import { expect, test, type Browser, type Page } from "@playwright/test";
import { credentials } from "./support";

// My Telegram: each role sees its own messages, and only the Admin sees the bot set-up and who is connected.
// (The messages themselves are checked by unit tests; no real Telegram is called here.)

async function as(browser: Browser, who: keyof typeof credentials): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials[who].email);
  await page.getByLabel("Password").fill(credentials[who].password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/deals");
  return page;
}

test("each role sees the messages meant for it, and only the Admin sees the bot set-up", async ({ browser }) => {
  const sales = await as(browser, "sales");
  await sales.goto("/telegram");
  await expect(sales.getByRole("heading", { name: "My Telegram" })).toBeVisible();
  await expect(sales.getByText("My deals: due, overdue, loan waiting")).toBeVisible();
  await expect(sales.getByText("A repair report is waiting for my approval")).toBeVisible(); // Sales decide on repairs too
  await expect(sales.getByText("Admin: the bot")).toHaveCount(0);
  await sales.close();

  const docs = await as(browser, "docs");
  await docs.goto("/telegram");
  await expect(docs.getByText("Papers still with the receiver")).toBeVisible();
  await expect(docs.getByText("Who is connected")).toHaveCount(0);
  await expect(docs.getByText("A repair report is waiting for my approval")).toHaveCount(0); // Buying do not decide on repairs
  await docs.close();

  const admin = await as(browser, "admin");
  await admin.goto("/telegram");
  await expect(admin.getByText("Something is broken")).toBeVisible();
  await expect(admin.getByText("Admin: the bot")).toBeVisible();
  await expect(admin.getByText("Who is connected")).toBeVisible();
  await admin.close();
});

test("Telegram's webhook refuses a caller without the secret", async ({ request }) => {
  const res = await request.post("/api/telegram/webhook", { data: { message: { text: "/start x", chat: { id: 1, type: "private" } } } });
  expect([401, 503]).toContain(res.status()); // 401 with a bot set up, 503 when this environment has no bot token
});
