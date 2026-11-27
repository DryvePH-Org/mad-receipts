import { expect, test, type Browser, type Page } from "@playwright/test";
import { PROOF, RECEIPT_PREFIX, adminClient, credentials } from "./support";

const NO = (n: number) => `${RECEIPT_PREFIX}-${n}`;

async function login(page: Page, who: keyof typeof credentials) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials[who].email);
  await page.getByLabel("Password").fill(credentials[who].password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/home");
}
async function as(browser: Browser, who: keyof typeof credentials) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, who);
  return page;
}
// The first Next on a step with something missing shows what is missing; a second one moves on.
const next = async (page: Page, to: string) => {
  const btn = page.getByRole("button", { name: new RegExp(`Next: ${to}`) });
  await btn.click();
  await page.waitForTimeout(150);
  if (await btn.count()) await btn.click();
};

/** An Admin says who sold the car (the first person with the Sales role in the list); Sales have no such box. */
async function pickSeller(page: Page) { const box = page.getByLabel("Who sold it"); if (await box.count()) await box.selectOption({ index: 1 }); }

/** Fills the whole form for a financed sale with a trade-in, as Sales would. */
async function fillFinanced(page: Page, no: string, plate: string) {
  await page.goto("/new");
  await page.getByLabel("Receipt No.").fill(no);
  await page.getByLabel("Received from").fill("ZZT E2E Maria Santos");
  await pickSeller(page);
  await page.getByLabel("Contact no.").fill("09171234567");
  await page.getByLabel("Postal address").fill("27 Maginhawa St., Quezon City");
  await next(page, "Vehicle");
  await page.getByRole("button", { name: "Not in the inventory? Type it yourself" }).click();
  await page.getByLabel("Make / type").fill("2023 Toyota Vios 1.3 XLE");
  await page.getByLabel("Plate number").fill(plate);
  await page.getByRole("button", { name: "Silver Metallic" }).click();
  await next(page, "Deal");
  await page.getByLabel("Agreed price").fill("720000");
  await page.getByRole("radio", { name: /Financing/ }).click();
  await page.getByLabel("Institution").selectOption("BDO");
  await page.getByLabel("Down payment or loan").fill("150000");
  await page.getByRole("radio", { name: "Yes, trade-in" }).click();
  await page.getByLabel("Unit", { exact: true }).fill("2008 Toyota Vios J");
  await page.getByLabel("Trade-in value").fill("60000");
}

test("the whole flow: Sales fills in and saves, it is final at once, the numbers agree", async ({ browser }) => {
  const sales = await as(browser, "admin");
  await fillFinanced(sales, NO(1), "ZZT 1001");

  // the money rules, live on the screen
  await expect(sales.getByText("Buyer must pay us in cash")).toBeVisible();
  await expect(sales.getByText("₱39,900", { exact: true }).first()).toBeVisible(); // 7% of the ₱570,000 loan, the standard fee
  await expect(sales.getByText("₱129,900").first()).toBeVisible(); // 150,000 down payment − 60,000 trade-in + 39,900 fee
  // the fee buttons: no fee, a custom percent (shows the pesos), a custom amount (shows the percent), back to the standard
  await sales.getByRole("radio", { name: "No fee" }).click();
  await expect(sales.getByText("No processing fee on this deal.")).toBeVisible();
  await expect(sales.getByText("₱90,000").first()).toBeVisible();
  await sales.getByRole("radio", { name: "Other" }).click();
  await sales.locator("#feeIn").fill("5");
  await expect(sales.getByText("5% of the ₱570,000 loan = ₱28,500.")).toBeVisible();
  await sales.getByRole("radio", { name: "₱ amount" }).click();
  await sales.locator("#feeIn").fill("42,750");
  await expect(sales.getByText("₱42,750 is 7.5% of the ₱570,000 loan.")).toBeVisible();
  await sales.getByRole("radio", { name: "7%", exact: true }).click();
  await expect(sales.getByText("₱129,900").first()).toBeVisible();
  await next(sales, "Payment");
  await sales.getByLabel("Cash amount").fill("40000");
  await sales.getByLabel("Earlier payments").fill("10000");
  await expect(sales.getByText("₱79,900").last()).toBeVisible(); // balance: 129,900 − 10,000 − 40,000

  await sales.getByLabel("Due date").fill("2026-12-15"); // a balance is left, so a due date is needed

  // sending without the proof is blocked
  await next(sales, "Finish");
  await sales.getByLabel(/I checked every field/).check();
  await expect(sales.getByRole("button", { name: /Save the receipt/ })).toBeDisabled();
  await expect(sales.getByText("Photo of the cash")).toBeVisible();

  // attach the proof, and it can be sent
  await sales.getByRole("button", { name: "Back" }).click();
  await sales.locator("#cash-proof input[type=file]").setInputFiles(PROOF);
  await expect(sales.getByText("✓ 1 attached")).toBeVisible();
  await next(sales, "Finish");
  await sales.getByLabel(/I checked every field/).check();
  await sales.getByRole("button", { name: /Save the receipt/ }).click();
  await expect(sales.getByRole("heading", { name: "Receipt saved" })).toBeVisible();
  const printHref = await sales.locator("a[href^=\"/print/\"]").first().getAttribute("href");

  // a saved receipt is final: it counts at once, and nobody has to approve it
  const admin = adminClient();
  const read = async () => (await admin.from("deal_summaries").select("id, balance, approved_paid, opening_paid, pending_count, loan_amount, processing_fee").eq("buyer_name", "ZZT E2E Maria Santos").single()).data;
  await expect.poll(async () => Number((await read())?.approved_paid)).toBe(40000);
  const after = await read();
  expect([Number(after?.opening_paid), Number(after?.balance), Number(after?.pending_count), Number(after?.loan_amount), Number(after?.processing_fee)]).toEqual([10000, 79900, 0, 570000, 39900]); // 129,900 due (down payment − trade-in + fee) − 10,000 earlier − 40,000
  const saved = (await admin.from("receipts").select("status, reviewed_by, submitted_by").eq("receipt_no", NO(1)).single()).data;
  expect(saved?.status).toBe("approved");
  expect(saved?.reviewed_by).toBe(saved?.submitted_by);
  await sales.goto("/deals");
  const salesRow = sales.getByRole("row").filter({ hasText: "ZZT E2E Maria Santos" });
  await expect(salesRow).toContainText("₱40,000");
  await expect(salesRow).not.toContainText(/waiting approval/i);
  await expect(sales.getByText("Waiting for approval")).toHaveCount(0);
  await sales.goto(`/deals/${after!.id}`);
  await expect(sales.getByText("Adds up").first()).toBeVisible();
  await expect(sales.getByText("Waiting for lender").first()).not.toBeVisible().catch(() => undefined);
  // the printed receipt is the half page of the booklet, two to an A4 sheet, and fits a phone screen
  await sales.goto(printHref!);
  await expect(sales.locator(".paper.ack")).toHaveCount(3); // three copies by default: two on the first sheet, one on the second
  await expect(sales.locator(".print-a4")).toHaveCount(2);
  await expect(sales.locator(".paper .wm")).toHaveCount(0); // no stamp on the paper, approved or not
  expect(await sales.locator(".paper.ack").first().evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Arial/);
  expect(await sales.locator(".paper.ack .ul").first().evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Arial/);
  await expect(sales.getByRole("button", { name: /1 per half sheet/ })).toHaveCount(0); // always two to a sheet
  await expect(sales.getByText("ACKNOWLEDGEMENT OF PAYMENT", { exact: false }).first()).toBeVisible();
  await expect(sales.locator(".print-a4 .cut")).toHaveCount(1); // the cut line is on the sheet that has two
  await expect(sales.getByRole("button", { name: /Full A4|Receipt slip/ })).toHaveCount(0); // one layout only
  await expect(sales.getByLabel("Paper")).toBeVisible(); // the sheet the printer uses (A4, short bond, long bond, legal)
  // every detail of the transaction is on the paper, labelled: financing, trade-in and the rest
  const firstPaper = sales.locator(".paper.ack").first();
  for (const label of ["Down payment", "Loan from BDO", "Processing fee", "Trade-in unit", "Trade-in value", "Earlier payments"]) await expect(firstPaper.locator(".adetails dt", { hasText: label })).toBeVisible();
  await sales.setViewportSize({ width: 390, height: 800 });
  await sales.waitForTimeout(500);
  expect(await sales.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true); // nothing pushes the page sideways
  await sales.setViewportSize({ width: 1280, height: 900 });
  // a conflict with a shared sheet stops the write and asks a person (simulated: the real sheets are switched off in these tests)
  const receiptId = (await admin.from("receipts").select("id").eq("receipt_no", NO(1)).single()).data!.id;
  await admin.from("sync_jobs").update({ status: "failed", attempts: 5, last_error: "CONFLICT: ZZT 1001: The sheet says \"RESERVED - ELLA 11/3\", naming ELLA, but this deal (D1) was opened by DAVID. Ask ELLA and DAVID who has this car." }).eq("receipt_id", receiptId).eq("target", "inventory");
  const boss = await as(browser, "admin");
  await boss.goto("/admin/sync?show=all");
  await expect(boss.getByText("Needs a decision").filter({ visible: true }).first()).toBeVisible();
  await expect(boss.getByText(/Ask ELLA and DAVID/).filter({ visible: true }).first()).toBeVisible();
  await boss.getByText("Write the app's note instead…").filter({ visible: true }).first().click();
  await expect(boss.getByRole("button", { name: "Yes, overwrite the sheet's note" }).filter({ visible: true }).first()).toBeVisible(); // asks twice before overwriting
  await boss.getByRole("button", { name: "Keep the sheet's note" }).filter({ visible: true }).first().click();
  await expect.poll(async () => (await admin.from("sync_jobs").select("status").eq("receipt_id", receiptId).eq("target", "inventory").single()).data?.status).toBe("done");
  await boss.close();
  await sales.close();
});

test("continuing a deal fills in at once; earnest money and a full payment work themselves out", async ({ browser }) => {
  const sales = await as(browser, "admin");
  // a car that already has an open deal offers to continue it, and the deal's details are there at once, with no refresh
  await sales.goto("/new");
  await sales.getByLabel("Received from").fill("ZZT E2E Someone Else");
  await pickSeller(sales);
  await next(sales, "Vehicle");
  await sales.getByRole("button", { name: "Not in the inventory? Type it yourself" }).click();
  await sales.getByLabel("Plate number").fill("ZZT 1001");
  await sales.getByRole("button", { name: "Continue this deal" }).click();
  await expect(sales.getByText(/^Continuing deal/)).toBeVisible();
  await expect(sales.getByLabel("Earlier payments")).toHaveValue("50,000"); // 10,000 earlier + 40,000 on the first receipt
  await sales.getByRole("button", { name: "Buyer" }).first().click();
  await expect(sales.getByLabel("Received from")).toHaveValue("ZZT E2E Maria Santos");
  await next(sales, "Vehicle");
  await next(sales, "Deal");
  await expect(sales.getByLabel("Agreed price")).toHaveValue("720,000");
  await next(sales, "Payment");
  // a full payment is exactly what is left: 129,900 − 50,000
  await sales.getByRole("radio", { name: /Full payment/ }).click();
  await expect(sales.getByLabel("Cash amount")).toBeDisabled();
  await expect(sales.getByLabel("Cash amount")).toHaveValue("79,900");
  await sales.getByRole("button", { name: "Edit" }).click();
  await expect(sales.getByLabel("Cash amount")).toBeEnabled();
  // on a new deal, earnest money has nothing before it, until Edit is pressed
  await sales.goto("/new");
  await sales.getByLabel("Receipt No.").fill("ZZT-E2E-EARNEST");
  await next(sales, "Vehicle");
  await next(sales, "Deal");
  await next(sales, "Payment");
  await sales.getByRole("radio", { name: /Earnest/ }).click();
  await expect(sales.getByLabel("Earlier payments")).toBeDisabled();
  await expect(sales.getByLabel("Earlier payments")).toHaveValue("0");
  await sales.getByRole("button", { name: "Edit" }).click();
  await expect(sales.getByLabel("Earlier payments")).toBeEnabled();
  await sales.close();
});

test("nothing is red when the form opens; what is missing shows when you try to move on; in-lieu shows in Payment and Finish", async ({ browser }) => {
  const sales = await as(browser, "admin");
  await sales.goto("/new");
  await expect(sales.getByText("Required", { exact: true })).toHaveCount(0); // calm at the start
  await expect(sales.getByText(/\d+ to fill in/)).toBeVisible();
  await sales.getByRole("button", { name: /Next: Vehicle/ }).click();
  await expect(sales.getByText("Required", { exact: true }).first()).toBeVisible(); // now it says what is missing, and stays on this step
  await expect(sales.getByText(/or press Next again to continue/)).toBeVisible();
  await sales.getByRole("button", { name: /Next: Vehicle/ }).click(); // pressing again moves on
  await expect(sales.getByRole("button", { name: /Next: Deal/ })).toBeVisible();
  await expect(sales.locator("ol[aria-label=Steps] li").first().locator("b")).toBeVisible(); // the step you left shows how many are still open
  // in lieu of documents is shown beside the payment and on the last step
  await sales.getByRole("button", { name: /Deal\s+Price/ }).click();
  const lieu = sales.getByText("Hold the documents as collateral");
  if (await lieu.count()) {
    await lieu.click();
    await sales.getByLabel("Amount to be paid after the documents are transferred").fill("25000");
    await sales.getByLabel("Pay on or before").fill("2026-12-20");
    await sales.getByRole("button", { name: /Payment\s+Money/ }).click();
    await expect(sales.locator("p", { hasText: "In lieu of documents" }).first()).toContainText("₱25,000");
    await sales.getByRole("button", { name: /Finish\s+Check/ }).click();
    await expect(sales.locator("p", { hasText: "In lieu of documents" }).first()).toContainText("25,000");
  }
  await sales.close();
});

test("the checks refuse a wrong or incomplete receipt", async ({ browser }) => {
  const sales = await as(browser, "admin");
  await sales.goto("/new");
  await next(sales, "Vehicle");
  await next(sales, "Deal");
  await next(sales, "Payment");
  await next(sales, "Finish");
  await sales.getByLabel(/I checked every field/).check();
  await expect(sales.getByText("Still to fill in:")).toBeVisible();
  await expect(sales.getByRole("button", { name: /Save the receipt/ })).toBeDisabled();
  await sales.close();
});

test("people see only what their role allows", async ({ browser }) => {
  const sales = await as(browser, "sales");
  for (const path of ["/settings", "/activity", "/admin/users"]) {
    await sales.goto(path);
    await expect(sales.getByText("You don't have access to this page."), path).toBeVisible();
  }
  await expect(sales.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await sales.close();

  const admin = await as(browser, "admin");
  await admin.goto("/settings");
  await expect(admin.getByRole("heading", { name: "Settings" })).toBeVisible();
  await admin.goto("/approvals"); // there is no Approvals page any more: a saved receipt is final
  await expect(admin.getByText(/This page could not be found|404/i).first()).toBeVisible();
  await admin.close();
});

test("a color the Admin adds shows up in the form", async ({ browser }) => {
  const admin = await as(browser, "admin");
  await admin.goto("/settings");
  await admin.getByLabel("New color name").first().fill("ZZT Gold");
  await admin.getByRole("button", { name: "Add" }).first().click();
  await expect(admin.getByText("Saved ✓")).toBeVisible();
  const sales = await as(browser, "admin");
  await sales.goto("/new");
  await next(sales, "Vehicle");
  await expect(sales.getByRole("button", { name: "ZZT Gold" })).toBeVisible();
  // put the settings back
  await admin.getByRole("button", { name: "Restore all defaults" }).click();
  await admin.getByRole("button", { name: "Restore defaults" }).click();
  await admin.close(); await sales.close();
});

test("voice fills the form and the math follows", async ({ browser }) => {
  const sales = await as(browser, "admin");
  // the voice reader itself is tested with the real Groq API (npm run test:live); here the answer is canned
  await sales.route("**/api/voice", (route) => route.fulfill({ json: { proposal: {
    source: "typed", transcript: "canned note", unsure: ["the contact number"], unclear: [], conflicts: [],
    fields: {
      receipt_no: null, date: null, kind: null, buyer_name: "ZZT E2E Voice Buyer", buyer_address: "Pasig City", buyer_contact: null,
      units: [{ make_type: "2019 Ford Everest", plate: "ZZT 2002", color: "Silver" }],
      price: 720000, sale: "financing", institution: "BDO", down_payment: 150000, down_payment_percent: null, loan_amount: null, monthly: null, years: null,
      fee_mode: "standard", fee_value: null, trade_in: null, lieu: null, earlier_paid: 20000, cash_today: 120000, wallets: [], check: null,
      due_date: null, due_text: null, remarks: null,
    },
  } } }));
  await sales.goto("/new");
  await sales.getByRole("button", { name: /Fill it by voice/ }).click();
  await sales.getByRole("radio", { name: "Type it" }).click();
  await sales.getByLabel("Type the details").fill("anything");
  await sales.getByRole("button", { name: "Read it" }).click();
  await expect(sales.getByText("Filled in:")).toBeVisible();
  await expect(sales.getByText(/couldn.t be sure about the contact number/)).toBeVisible();
  await expect(sales.getByLabel("Received from")).toHaveValue("ZZT E2E Voice Buyer");
  await next(sales, "Vehicle");
  await expect(sales.getByLabel("Color name")).toHaveValue("Silver"); // not one of the listed colors, so it is kept as said
  await next(sales, "Deal");
  await expect(sales.getByLabel("Agreed price")).toHaveValue("720,000");
  await expect(sales.getByText("₱189,900").first()).toBeVisible(); // 150,000 down payment + 39,900 standard fee
  await next(sales, "Payment");
  await next(sales, "Finish");
  await expect(sales.getByText("₱49,900").first()).toBeVisible(); // 189,900 − 20,000 earlier − 120,000 today
  await sales.close();
});
