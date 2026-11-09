import { expect, test, type Browser, type Page } from "@playwright/test";
import { RECEIPT_PREFIX, adminClient, credentials, cronSecret, userId } from "./support";

// The Documentation role and the car-documents module, on a stand-in Drive (DOCS_MOCK) with a fake picture reader
// that decides from the file name. The real Drive and the real reader are checked by `npm run test:live`.

async function login(page: Page, who: keyof typeof credentials) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials[who].email);
  await page.getByLabel("Password").fill(credentials[who].password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/deals");
}
async function as(browser: Browser, who: keyof typeof credentials) {
  const page = await (await browser.newContext()).newPage();
  await login(page, who);
  return page;
}

const BUYER = "ZZT E2E Docs Buyer";
let n = 100;
/** An AR made the way the app makes it, without going through the form. */
async function makeAr(plate: string) {
  const sales = await userId(credentials.sales.email);
  const { data, error } = await adminClient().rpc("submit_receipt", {
    p_actor: sales, p_require_proofs: false,
    p_payload: {
      receipt_no: `${RECEIPT_PREFIX}-D${++n}`, receipt_date: "2026-11-05", kind: "partial", buyer: { name: BUYER, address: "Pasig", contact: "09171234567" },
      units: [{ make_type: "Test car", plate, motor: "M1", chassis: "C1", color: "Silver" }], price: "500000", sale_type: "cash", due: { mode: "text", text: "soon" },
      payments: [{ method: "cash", amount: "100000" }],
    },
  });
  if (error) throw error;
  made.push((data as { receipt_id: string }).receipt_id);
  return data as { deal_id: string };
}
/** The ARs made here would crowd the Approver's list for the other tests, so they are rejected at the end. */
const made: string[] = [];
async function tidy() {
  const approver = await userId(credentials.approver.email);
  for (const id of made.splice(0)) await adminClient().rpc("review_receipt", { p_actor: approver, p_receipt_id: id, p_approve: false, p_reason: "test" });
}

const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");

test("an AR finds its car folder; Documentation checks the papers, Sales adds the rest, the folder moves to Sold", async ({ browser, playwright, baseURL }) => {
  await makeAr("ZZT 7001"); // one folder in Available: links
  await makeAr("ZZT 7002"); // two folders: a person chooses
  await makeAr("ZZT 7004"); // no folder: a person looks

  // the job that finds the folders runs (here by the same call the scheduler makes)
  const cron = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "x-cron-secret": cronSecret() } });
  expect((await cron.post("/api/sync/run")).ok()).toBe(true);

  const docs = await as(browser, "docs");
  await docs.goto("/documents");
  await expect(docs.getByRole("heading", { name: "Car documents" })).toBeVisible();
  // the two with no single folder need a person (the list also holds the real folders, so no counts here)
  await expect(docs.getByRole("tab", { name: /Needs attention/ })).toBeVisible();
  await expect(docs.getByText("Several folders")).toBeVisible();
  await expect(docs.getByText("No folder found")).toBeVisible();

  // several folders: choose one
  await docs.getByRole("link", { name: /ZZT-7002|ZZT 7002/ }).first().click();
  await expect(docs.getByText("More than one folder matches this plate")).toBeVisible();
  await docs.getByRole("button", { name: "Use this one" }).first().click();
  await expect(docs.getByText("Checklist")).toBeVisible();

  // the clean car: read the three photos in the folder
  await docs.goto("/documents/ZZT7001");
  await expect(docs.getByText(/Plate ZZT.?7001/)).toBeVisible();
  await expect(docs.getByText("All read")).toBeVisible({ timeout: 30_000 }); // read automatically, nobody pressed anything
  // the OR and the CR are one photo; the ID belongs to the owner on the CR; the deed is seller to dealership
  await expect(docs.getByText("Official receipt (OR)").first()).toBeVisible();
  await expect(docs.getByText("ID of the registered owner").first()).toBeVisible();
  const missingBefore = docs.locator("li", { hasText: "Missing" });
  await expect(missingBefore).toHaveCount(2); // the buyer's ID and the signed deed: Sales provides them

  // the transmittal receipt: starts from what the folder shows, the staff fill in the rest, save, and print
  await docs.locator("a[href$=\"/transmittal\"]").first().click();
  await expect(docs.getByRole("heading", { name: "Transmittal receipt", exact: true })).toBeVisible();
  await expect(docs.getByLabel("Plate no.")).toHaveValue(/ZZT.?7001/);
  await expect(docs.getByText("in the folder").first()).toBeVisible(); // the papers the workflow found are ticked
  await expect(docs.getByLabel("Original copy of Certificate of Registration #", { exact: false }).first()).toBeChecked();
  await docs.getByLabel("Spare Key").check(); // handed over by hand: not in any folder
  await docs.getByLabel("Received by").fill("ZZT E2E Receiver");
  await docs.getByLabel("Other 1").fill("Plate cover");
  await docs.getByRole("button", { name: "Save", exact: true }).click();
  await expect(docs.getByText(/^Saved\.$|needs the latest database update|Could not save/).first()).toBeVisible(); // the answer to Save
  const notReady = await docs.getByText(/needs the latest database update/).count(); // the test database may not have migration 22 yet
  if (!notReady) {
    await expect(docs.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await docs.reload(); // saved: it comes back as typed
    await expect(docs.getByLabel("Received by")).toHaveValue("ZZT E2E Receiver");
    await expect(docs.getByLabel("Spare Key")).toBeChecked();
  }
  await docs.goto("/print/transmittal/ZZT7001");
  await expect(docs.locator(".paper.tm")).toHaveCount(2);
  await expect(docs.locator(".paper.tm").first()).toContainText("ACKNOWLEDGEMENT/TRANSMITTAL RECEIPT");
  if (!notReady) await expect(docs.locator(".paper.tm").first()).toContainText("ZZT E2E Receiver");
  await docs.goto("/documents/ZZT7001");

  // Sales: the plate leads to the right car, then the papers go in
  const sales = await as(browser, "sales");
  await expect(sales.getByRole("link", { name: "Car documents" })).toHaveCount(0);
  await sales.goto("/documents/ZZT7001/transmittal"); // not part of the Sales role
  await expect(sales.getByText("You don't have access to this page.")).toBeVisible();
  await sales.goto("/documents");
  await expect(sales.getByText("You don't have access to this page.")).toBeVisible();
  await sales.goto("/upload-documents");
  await sales.getByLabel("Plate number").fill("ZZT 7004");
  await sales.getByRole("button", { name: "Find the car" }).click();
  await expect(sales.getByText(/no folder in Drive for this plate/)).toBeVisible(); // not an accurate pipeline if it guessed
  await sales.getByLabel("Plate number").fill("ZZT 9999");
  await sales.getByRole("button", { name: "Find the car" }).click();
  await expect(sales.getByText(/No AR has been made for ZZT 9999/)).toBeVisible();
  await sales.getByLabel("Plate number").fill("ZZT 7001");
  await sales.getByRole("button", { name: "Find the car" }).click();
  await expect(sales.getByText(BUYER).first()).toBeVisible();
  await expect(sales.getByText("Buyer's ID")).toBeVisible();
  await sales.getByRole("button", { name: "Yes, this is the car" }).click();
  await expect(sales.getByText("Still needed")).toHaveCount(2);

  // a photo through the screen (the stand-in reader cannot tell what it is) ...
  await sales.locator("#doc-photos").setInputFiles({ name: "x.jpg", mimeType: "image/jpeg", buffer: JPEG });
  await expect(sales.getByText("Saved ✓")).toBeVisible({ timeout: 30_000 });
  await expect(sales.getByText(/Not recognised\. It is in the folder/)).toBeVisible();
  // ... and the two papers Sales provides (named so the stand-in reader knows them)
  for (const label of ["id-ZZT_E2E_Docs_Buyer", "deed-buyer-ZZT_E2E_Docs_Buyer"]) {
    const res = await sales.request.post("/api/docs/upload", { multipart: { plate: "ZZT 7001", label, file: { name: "p.jpg", mimeType: "image/jpeg", buffer: JPEG } } });
    expect(res.ok(), label).toBe(true);
    expect((await res.json()).result.types.length).toBeGreaterThan(0);
  }

  // Documentation sees it complete, and moving asks first
  await docs.reload();
  await expect(docs.getByText("Everything is in. The car can move to Sold.")).toBeVisible();
  await expect(docs.getByText("From Sales").first()).toBeVisible();
  await docs.getByRole("button", { name: "Move to Sold" }).click();
  await expect(docs.getByRole("heading", { name: "Move to Sold?" })).toBeVisible();
  await docs.getByRole("dialog").getByRole("button", { name: "Move to Sold" }).click();
  await expect(docs.getByText("In Sold units")).toBeVisible({ timeout: 20_000 });

  // an incomplete car warns first
  await docs.goto("/documents/ZZT7002");
  await docs.getByRole("button", { name: "Move to Sold" }).click();
  await expect(docs.getByRole("heading", { name: "Move to Sold with things missing?" })).toBeVisible();
  await expect(docs.getByRole("dialog").getByText("Certificate of registration (CR)")).toBeVisible();
  await docs.getByRole("button", { name: "Cancel" }).click();

  await tidy();
  await docs.close(); await sales.close(); await cron.dispose();
});

test("each role sees only its own pages", async ({ browser }) => {
  const docs = await as(browser, "docs");
  for (const path of ["/new", "/approvals", "/cash", "/settings", "/upload-documents"]) {
    await docs.goto(path);
    await expect(docs.getByText("You don't have access to this page."), path).toBeVisible();
  }
  await expect(docs.getByRole("link", { name: "Car documents" })).toBeVisible();
  await expect(docs.getByRole("link", { name: "New receipt" })).toHaveCount(0);
  await docs.close();

  const admin = await as(browser, "admin");
  await admin.goto("/documents");
  await expect(admin.getByRole("heading", { name: "Car documents" })).toBeVisible();
  await admin.close();
});
