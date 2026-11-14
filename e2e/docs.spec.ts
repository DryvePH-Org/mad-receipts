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
  await expect(docs.getByText("Several folders").first()).toBeVisible();
  await expect(docs.getByText("No folder found").first()).toBeVisible();

  // several folders: choose one
  await docs.getByRole("link", { name: /ZZT-7002|ZZT 7002/ }).first().click();
  await expect(docs.getByText("More than one folder matches this plate")).toBeVisible();
  await docs.getByRole("button", { name: "Use this one" }).first().click();
  await expect(docs.getByText("Papers needed")).toBeVisible();

  // the clean car: read the three photos in the folder
  await docs.goto("/documents/ZZT7001");
  await expect(docs.getByText(/Plate ZZT.?7001/)).toBeVisible();
  await expect(docs.getByText("All read")).toBeVisible({ timeout: 30_000 }); // read automatically, nobody pressed anything
  // the OR and the CR are one photo; the ID belongs to the owner on the CR; the deed is seller to dealership
  await expect(docs.getByText("Official receipt (OR)").first()).toBeVisible();
  await expect(docs.getByText("ID of the registered owner").first()).toBeVisible();
  const missingBefore = docs.locator("#checklist li", { hasText: "Missing" });
  await expect(missingBefore).toHaveCount(3); // the buyer's ID and the signed deed: Sales provides them

  // the transmittal receipt: starts from what the folder shows, the staff fill in the rest, save, and print
  await docs.locator("a[href$=\"/transmittal\"]").first().click();
  await expect(docs.getByRole("heading", { name: "Transmittal receipt", exact: true })).toBeVisible();
  await expect(docs.getByLabel("Plate no.")).toHaveValue(/ZZT.?7001/);
  await expect(docs.getByText("in the folder").first()).toBeVisible(); // the papers the workflow found are ticked
  await expect(docs.getByLabel("Original copy of Certificate of Registration #", { exact: false }).first()).toBeChecked();
  await docs.getByRole("checkbox", { name: "Spare Key" }).check(); // handed over by hand: not in any folder
  await docs.getByLabel("Received by").fill("ZZT E2E Receiver");
  await docs.getByLabel("Other 1").fill("Plate cover");
  await docs.getByRole("button", { name: "Save", exact: true }).click();
  await expect(docs.getByText(/^Saved\.$|needs the latest database update|Could not save/).first()).toBeVisible(); // the answer to Save
  const notReady = await docs.getByText(/needs the latest database update/).count(); // the test database may not have migration 22 yet
  if (!notReady) {
    await expect(docs.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await docs.reload(); // saved: it comes back as typed
    await expect(docs.getByLabel("Received by")).toHaveValue("ZZT E2E Receiver");
    await expect(docs.getByRole("checkbox", { name: "Spare Key" })).toBeChecked();
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
  await expect(sales.getByText("Still needed")).toHaveCount(3); // the signed AR, the buyer's ID and the deed

  // a photo through the screen (the stand-in reader cannot tell what it is) ...
  await sales.locator("#doc-photos").setInputFiles({ name: "x.jpg", mimeType: "image/jpeg", buffer: JPEG });
  await expect(sales.getByText("Saved ✓")).toBeVisible({ timeout: 30_000 });
  await expect(sales.getByText(/Not recognised\. It is in the folder/)).toBeVisible();
  // ... and the three papers Sales provides (named so the stand-in reader knows them)
  for (const label of ["id-ZZT_E2E_Docs_Buyer", "deed-buyer-ZZT_E2E_Docs_Buyer", "ar-ZZT_E2E_Docs_Buyer"]) {
    const res = await sales.request.post("/api/docs/upload", { multipart: { plate: "ZZT 7001", label, file: { name: "p.jpg", mimeType: "image/jpeg", buffer: JPEG } } });
    expect(res.ok(), label).toBe(true);
    expect((await res.json()).result.types.length).toBeGreaterThan(0);
  }

  // Documentation sees it complete, and moving asks first
  await docs.reload();
  await expect(docs.getByText("Every paper is in.")).toBeVisible();
  await expect(docs.getByText("From Sales").first()).toBeVisible();

  // the buttons follow the workflow: the folder cannot move before the documents are approved
  await expect(docs.getByRole("button", { name: "Move to Sold" })).toBeDisabled();
  await expect(docs.getByText("Approve the documents first.").first()).toBeVisible();
  await docs.getByRole("button", { name: "Approve: documents are OK" }).click();
  await expect(docs.getByRole("heading", { name: "Approve with things still open?" })).toBeVisible(); // the details about the car are still blank
  await docs.getByRole("dialog").getByRole("button", { name: "Go on anyway" }).click();
  await expect(docs.getByText(/^Approved /).first()).toBeVisible({ timeout: 20_000 });
  await docs.reload();
  await expect(docs.getByRole("button", { name: "Move to Sold" })).toBeEnabled();
  await docs.getByRole("button", { name: "Move to Sold" }).click();
  await expect(docs.getByRole("dialog").getByRole("heading", { name: "Move to Sold?" })).toBeVisible();
  await docs.getByRole("dialog").getByRole("button", { name: "Move to Sold" }).click();
  await expect(docs.getByText("In Sold units").first()).toBeVisible({ timeout: 20_000 });
  await expect(docs.getByText("Handoff to").first()).toBeVisible();

  // a car that is not approved cannot be moved (only an Admin may go past that), and it says why
  await docs.goto("/documents/ZZT7002");
  await expect(docs.getByRole("button", { name: "Move to Sold" })).toBeDisabled();
  await expect(docs.getByText(/Approve the documents first\./).first()).toBeVisible();
  await expect(docs.getByRole("button", { name: /Move anyway/ })).toHaveCount(0); // that button is the Admin's

  await tidy();
  await docs.close(); await sales.close(); await cron.dispose();
});

test("Documentation adds photos by typing only the plate: the folder is made, the photos are read", async ({ browser }) => {
  const docs = await as(browser, "docs");
  await docs.goto("/documents/add");
  await expect(docs.getByRole("heading", { name: "Add documents" })).toBeVisible();
  // a plate with no folder: it says a new one will be made
  await docs.getByLabel("Plate number").fill("zzt 7010");
  await docs.getByRole("button", { name: "Check" }).click();
  await expect(docs.getByText("There is no folder for this plate yet")).toBeVisible();
  // a plate that already has one: the photos are added to it
  await docs.getByLabel("Plate number").fill("ZZT 7001");
  await docs.getByRole("button", { name: "Check" }).click();
  await expect(docs.getByText(/The folder already exists in (Available|Sold) units/)).toBeVisible();

  // one photo through the screen
  await docs.getByLabel("Plate number").fill("ZZT 7010");
  await docs.getByRole("button", { name: "Check" }).click();
  await docs.locator("#add-photos").setInputFiles({ name: "x.jpg", mimeType: "image/jpeg", buffer: JPEG });
  await expect(docs.getByText("Saved ✓")).toBeVisible({ timeout: 30_000 });
  await expect(docs.getByText(/The team has been told/)).toBeVisible({ timeout: 30_000 });
  // and one the stand-in reader knows by its name
  const res = await docs.request.post("/api/docs/add", { multipart: { plate: "ZZT 7010", label: "cr-or", file: { name: "p.jpg", mimeType: "image/jpeg", buffer: JPEG } } });
  expect(res.ok()).toBe(true);
  expect((await res.json()).result.types).toContain("official_receipt");
  // the car now has its folder and both files
  await docs.goto("/documents/ZZT7010");
  await expect(docs.getByText("Papers needed")).toBeVisible();
  await expect(docs.getByText("Official receipt (OR)").first()).toBeVisible();

  const db = adminClient();
  await db.from("folder_files").delete().eq("plate_no", "ZZT7010");
  await db.from("unit_folders").delete().eq("plate_no", "ZZT7010");
  await docs.close();
});

test("each role sees only its own pages", async ({ browser }) => {
  const docs = await as(browser, "docs");
  for (const path of ["/new", "/approvals", "/settings", "/upload-documents"]) {
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
