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
let n = Date.now() % 1_000_000; // a number no earlier (aborted) run has used
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
/** The ARs made here stay until the test run is cleaned up at the end (nothing waits for approval any more). */
const made: string[] = [];
async function tidy() { made.splice(0); }

const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");

test("an AR finds its car folder; Documentation checks the papers, Sales adds the rest, the folder moves to Sold", async ({ browser, playwright, baseURL }) => {
  test.setTimeout(240_000); // the longest flow: three cars, two roles, every step
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
  await docs.getByLabel("Search cars").fill("ZZT");
  await expect(docs.getByRole("link", { name: /ZZT.?7002/ }).first()).toContainText("Folder not linked");
  await expect(docs.getByRole("link", { name: /ZZT.?7004/ }).first()).toContainText("Folder not linked");
  // the folder filter: ZZT 7001 sits in Available units, ZZT 7004 has no folder
  await docs.getByRole("tab", { name: /^In Available units/ }).click();
  await expect(docs.getByRole("link", { name: /ZZT.?7001/ }).first()).toBeVisible();
  await expect(docs.getByRole("link", { name: /ZZT.?7004/ })).toHaveCount(0);
  await docs.getByRole("tab", { name: /^No folder/ }).click();
  await expect(docs.getByRole("link", { name: /ZZT.?7004/ }).first()).toBeVisible();
  await docs.getByRole("tab", { name: /^Any folder/ }).click();
  await docs.getByLabel("Search cars").fill("");

  // several folders: choose one
  await docs.getByRole("link", { name: /ZZT-7002|ZZT 7002/ }).first().click();
  await expect(docs.getByText("More than one folder matches this plate")).toBeVisible();
  await docs.getByRole("button", { name: "Use this one" }).first().click();
  await expect(docs.locator("#papers")).toBeVisible();

  // the clean car: read the three photos in the folder
  await docs.goto("/documents/ZZT7001");
  await expect(docs.getByText(/Plate ZZT.?7001/)).toBeVisible();
  await expect(docs.getByText("All scanned")).toBeVisible({ timeout: 30_000 }); // read automatically, nobody pressed anything
  // the OR and the CR are one photo; the ID belongs to the owner on the CR; the deed is seller to dealership
  await expect(docs.getByText("Official receipt (OR)").first()).toBeVisible();
  await expect(docs.getByText("ID of the registered owner").first()).toBeVisible();
  const missingBefore = docs.locator("#papers li", { hasText: "Missing" });
  await expect(missingBefore).toHaveCount(3); // the buyer's ID and the signed deed: Sales provides them

  // a correction by one person shows in the Papers part at once, and for another person without reloading
  const other = await as(browser, "docs");
  await other.goto("/documents/ZZT7001");
  await other.locator("#papers li", { hasText: "Official receipt (OR)" }).click();
  await other.getByRole("dialog").getByRole("button", { name: "Change what this is" }).first().click();
  await other.getByRole("dialog").getByRole("checkbox", { name: "Official receipt (OR)" }).uncheck();
  await other.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(docs.locator("#papers li", { hasText: "Official receipt (OR)" })).toContainText("Missing", { timeout: 30_000 }); // the first person's page was not reloaded by hand
  await expect(other.locator("#papers li", { hasText: "Official receipt (OR)" })).toContainText("Missing", { timeout: 30_000 });
  await other.keyboard.press("Escape");
  await other.locator("#papers li", { hasText: "Certificate of registration" }).first().click();
  await other.getByRole("dialog").getByRole("button", { name: "Change what this is" }).first().click();
  await other.getByRole("dialog").getByRole("button", { name: "Go back to what was read" }).click();
  await expect(docs.locator("#papers li", { hasText: "Official receipt (OR)" })).toContainText("In the folder", { timeout: 30_000 });
  await other.close();

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
  await expect(sales.getByRole("link", { name: "Car documents" }).first()).toBeVisible(); // everyone can look, nobody but Documentation and Admin can act
  await sales.goto("/documents/ZZT7001/transmittal"); // not part of the Sales role
  await expect(sales.getByText("You don't have access to this page.")).toBeVisible();
  await sales.goto("/documents/ZZT7001"); // the car page for Sales: all the information and the photos, no action button
  await expect(sales.locator("#papers")).toBeVisible();
  await expect(sales.locator("#papers img").first()).toBeVisible(); // they can see the photos
  await sales.locator("#papers li", { hasText: "Official receipt (OR)" }).click(); // and open a paper: the photo large and what the bot read, with no button to change it
  await expect(sales.getByRole("dialog").getByRole("button", { name: /^View .* larger$/ }).first()).toBeVisible();
  await expect(sales.getByRole("dialog").getByRole("button", { name: "Change what this is" })).toHaveCount(0);
  await sales.keyboard.press("Escape");
  await expect(sales.getByRole("button", { name: "Approve: documents are OK" })).toHaveCount(0);
  await expect(sales.getByRole("button", { name: /^Scan / })).toHaveCount(0);
  await expect(sales.getByRole("button", { name: "Upload documents" })).toHaveCount(0);
  await expect(sales.getByRole("button", { name: "Change what this is" })).toHaveCount(0);
  await expect(sales.getByRole("combobox", { name: "Case" })).toBeDisabled();
  // the only thing Sales can do here: add the sold papers (the AR's buyer is shown)
  await expect(sales.locator("#sold-upload")).toContainText(BUYER);
  await expect(sales.getByText("Still needed")).toHaveCount(3); // the signed AR, the buyer's ID and the deed
  // a plate nobody has sold never gets a photo, whatever is sent to the server
  const refused = await sales.request.post("/api/docs/upload", { multipart: { plate: "ZZT 9999", file: { name: "p.jpg", mimeType: "image/jpeg", buffer: JPEG } } });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).error).toMatch(/No AR has been made for ZZT 9999/);
  // the old page is gone: its address leads to Car documents
  await sales.goto("/upload-documents");
  await expect(sales.getByRole("heading", { name: "Car documents" })).toBeVisible();
  await expect(sales.getByRole("link", { name: "Upload documents" })).toHaveCount(0);
  await sales.goto("/documents/ZZT7001");

  // a photo through the screen (the stand-in reader cannot tell what it is) ...
  await sales.waitForTimeout(2500); // the page must be ready (hydrated) before a file is given to it; the car page keeps polling, so "network idle" never comes
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
  await expect(docs.locator("#papers")).toContainText("4 of 4 in the folder");
  await expect(docs.locator("#papers li", { hasText: "Buyer's ID" })).toContainText("In the folder"); // the papers Sales added

  // the buttons follow the workflow: the folder cannot move before the documents are approved
  await expect(docs.getByRole("button", { name: "Move to Sold" })).toBeDisabled();
  await expect(docs.getByText("Approve the documents first.").first()).toBeVisible();
  // the bot only suggests the case: approval waits until a person chooses it
  await expect(docs.getByText("Choose the case first").first()).toBeVisible();
  await docs.getByRole("combobox", { name: "Case" }).selectOption({ label: "Clean" });
  await expect(docs.getByRole("button", { name: "Approve: documents are OK" })).toBeEnabled({ timeout: 15_000 });
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
  // the register tells the same story as the folder: the car is SOLD there too
  await expect.poll(async () => (await (adminClient() as unknown as { from: (t: string) => any }).from("docs_units_current").select("sale_status, vehicle_status").eq("plate_no", "ZZT7001").maybeSingle()).data, { timeout: 15_000 }).toMatchObject({ sale_status: "Sold", vehicle_status: "SOLD" }); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect(docs.getByText("Handoff to").first()).toBeVisible();

  // Documentation hands the papers off; from here only an Admin can correct things, and every correction asks first
  await docs.getByRole("button", { name: /^Handed off to/ }).click();
  await docs.getByRole("dialog").getByRole("button", { name: "Go on anyway" }).click();
  await expect(docs.getByText(/^Handed off on/).first()).toBeVisible({ timeout: 20_000 });
  await expect(docs.getByText("Admin: correct this handoff")).toHaveCount(0);
  await expect(docs.getByRole("button", { name: /Withdraw the approval/ })).toHaveCount(0);
  const admin = await as(browser, "admin");
  await admin.goto("/documents/ZZT7001");
  // a change to the car's information asks first: Cancel keeps it as it was, the second time it goes through
  await admin.getByText("About the car").first().click();
  await admin.locator("#ud-note").fill("Corrected by the Admin");
  await admin.getByRole("button", { name: "Save the details" }).click();
  await expect(admin.getByRole("heading", { name: "Change a car that is already sold?" })).toBeVisible();
  await admin.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  expect(((await adminClient().from("unit_details").select("data").eq("plate_no", "ZZT7001").maybeSingle()).data?.data as { note?: string } | undefined)?.note ?? "").not.toBe("Corrected by the Admin");
  await admin.getByRole("button", { name: "Save the details" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Yes, change this" }).click();
  await expect.poll(async () => ((await adminClient().from("unit_details").select("data").eq("plate_no", "ZZT7001").maybeSingle()).data?.data as { note?: string } | undefined)?.note, { timeout: 20_000 }).toBe("Corrected by the Admin");
  // the handoff: change the note, then take it back
  await admin.locator("#ho-note-admin").fill("Fixed note");
  await admin.getByRole("button", { name: "Save the ticks and note" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Yes, save the changes" }).click();
  await expect(admin.getByText(/Handed off on .*Fixed note/)).toBeVisible({ timeout: 20_000 });
  await admin.getByRole("button", { name: "Undo the handoff" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Yes, undo it" }).click();
  await expect(admin.getByText("Not handed off").first()).toBeVisible({ timeout: 20_000 });
  // and the approval can be withdrawn, so it can be approved again
  await admin.getByRole("button", { name: "Withdraw the approval (Admin)" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Yes, withdraw it" }).click();
  await expect(admin.getByText("Not approved yet").first()).toBeVisible({ timeout: 20_000 });
  await admin.close();

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
  await expect(docs.getByRole("heading", { name: "Add a car" })).toBeVisible();
  // a plate with no folder: it says a new one will be made
  await docs.getByLabel("Plate number").fill("zzt 7010");
  await expect(docs.getByText("There is no folder for this plate yet")).toBeVisible();
  // a plate that already has one: the photos are added to it
  await docs.getByLabel("Plate number").fill("ZZT 7001");
  await expect(docs.getByText(/A folder already exists for this plate/)).toBeVisible();

  // one photo through the screen
  await docs.getByLabel("Plate number").fill("ZZT 7010");
  // the car is added to the Docs Bible first: the details are needed, and the photos wait for them
  await expect(docs.getByText("This plate is not in MAD yet")).toBeVisible();
  await expect(docs.getByText("Save the car first, then add its documents.")).toBeVisible();
  await expect(async () => { await docs.getByRole("button", { name: "Save the car" }).click(); await expect(docs.getByText("Type the make.")).toBeVisible({ timeout: 3000 }); }).toPass({ timeout: 30_000 }); // the page may still be waking up
  await docs.getByLabel("Make *").fill("toyota"); await docs.getByLabel("Model *").fill("vios 1.3 e");
  await docs.getByLabel("Year *").fill("2019"); await docs.getByLabel("Color *").fill("white");
  await expect(async () => { await docs.locator("#staged-photos").setInputFiles({ name: "y.jpg", mimeType: "image/jpeg", buffer: JPEG }); await expect(docs.getByText("1 photo chosen")).toBeVisible({ timeout: 3000 }); }).toPass({ timeout: 30_000 }); // chosen in the form: it goes to Drive right after the car is saved
  await docs.getByRole("button", { name: "Save the car and upload 1 document" }).click();
  await expect(docs.getByText(/is in MAD/)).toBeVisible();
  await expect(docs.getByText(/The team has been told/)).toBeVisible({ timeout: 30_000 });
  const row = await adminClient().from("docs_units_current" as never).select("make, year_model, color, source, vehicle_status" as never).eq("plate_no", "ZZT7010").single() as unknown as { data: Record<string, string> };
  expect(row.data).toMatchObject({ make: "TOYOTA", year_model: "19", color: "WHITE", source: "app", vehicle_status: "AVAILABLE" });
  await docs.locator("#add-photos").setInputFiles({ name: "x.jpg", mimeType: "image/jpeg", buffer: JPEG });
  await expect(docs.getByText("Saved ✓")).toBeVisible({ timeout: 30_000 });
  await expect(docs.getByText(/The team has been told/)).toBeVisible({ timeout: 30_000 });
  // an iPhone photo (HEIC): the page turns it into a JPEG itself
  await docs.locator("#add-photos").setInputFiles("e2e/fixtures/sample.heic");
  await expect(docs.getByText("sample.heic").locator("..").getByText("Saved ✓")).toBeVisible({ timeout: 60_000 });
  // and one the stand-in reader knows by its name
  const res = await docs.request.post("/api/docs/add", { multipart: { plate: "ZZT 7010", label: "cr-or", file: { name: "p.jpg", mimeType: "image/jpeg", buffer: JPEG } } });
  expect(res.ok()).toBe(true);
  expect((await res.json()).result.types).toContain("official_receipt");
  // the car now has its folder and both files
  await docs.goto("/documents/ZZT7010");
  await expect(docs.locator("#papers")).toBeVisible();
  await expect(docs.getByText("Official receipt (OR)").first()).toBeVisible();

  // a photo opens in the zoom viewer (+, −, Fit), and Documentation can remove it from the folder (after a question)
  await docs.locator("#papers li", { hasText: "Official receipt (OR)" }).click();
  const dialog = docs.getByRole("dialog");
  await dialog.getByRole("button", { name: /^View .* larger$/ }).first().click();
  await expect(docs.getByRole("button", { name: "Zoom in" })).toBeVisible();
  await docs.getByRole("button", { name: "Zoom in" }).click();
  await expect(docs.getByText("150%")).toBeVisible();
  await docs.getByRole("button", { name: "Fit" }).click();
  await expect(docs.getByText("100%")).toBeVisible();
  await docs.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Remove this photo" }).first().click();
  await expect(dialog.getByText(/goes to the Drive trash for 30 days/)).toBeVisible();
  await dialog.getByRole("button", { name: "Keep it" }).click();
  await expect(dialog.getByRole("button", { name: "Remove this photo" }).first()).toBeVisible();
  const before = (await adminClient().from("folder_files").select("id").eq("plate_no", "ZZT7010")).data?.length ?? 0;
  await dialog.getByRole("button", { name: "Remove this photo" }).first().click();
  await dialog.getByRole("button", { name: "Yes, remove it" }).click();
  await expect(async () => expect((await adminClient().from("folder_files").select("id").eq("plate_no", "ZZT7010")).data?.length ?? 0).toBe(before - 1)).toPass({ timeout: 30_000 });

  // only an Admin can remove the car itself; Documentation does not see the button
  await docs.goto("/documents/ZZT7010");
  await expect(docs.locator("#papers")).toBeVisible();
  await expect(docs.getByRole("button", { name: "Remove this car" })).toHaveCount(0);
  const admin = await as(browser, "admin");
  await admin.goto("/documents/ZZT7010");
  await admin.getByText("Remove this car (Admin)").click();
  await admin.getByRole("button", { name: "Remove this car" }).click();
  await admin.getByRole("button", { name: "Yes, remove this car" }).click();
  await admin.waitForURL("**/documents");
  const gone = await adminClient().from("docs_units_current" as never).select("id" as never).eq("plate_no", "ZZT7010") as unknown as { data: unknown[] };
  expect(gone.data).toHaveLength(0);
  expect(((await adminClient().from("unit_folders").select("plate_no").eq("plate_no", "ZZT7010")).data ?? []).length).toBe(0);
  await admin.close();

  const db = adminClient();
  await db.from("folder_files").delete().eq("plate_no", "ZZT7010");
  await db.from("unit_folders").delete().eq("plate_no", "ZZT7010");
  await docs.close();
});

test("each role sees only its own pages", async ({ browser }) => {
  const docs = await as(browser, "docs");
  for (const path of ["/new", "/settings"]) {
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

test("Sales and Documentation put a saved receipt in the car's folder with a button; nothing is filed by itself", async ({ browser, playwright, baseURL }) => {
  test.setTimeout(180_000);
  const ar = await makeAr("ZZT 7003"); // a car with one folder (in Sold) and an AR
  const receiptId = made[made.length - 1];
  const cron = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "x-cron-secret": cronSecret() } });
  expect((await cron.post("/api/sync/run")).ok()).toBe(true); // the folder is linked to the deal
  expect(ar.deal_id).toBeTruthy();

  const docs = await as(browser, "docs");
  await docs.goto("/documents/ZZT7003");
  await expect(docs.locator("#papers")).toBeVisible();
  // a saved receipt is offered at once, and it is not in the folder until the button is pressed
  expect((await adminClient().from("receipts").select("status").eq("id", receiptId).single()).data?.status).toBe("approved");
  await expect(docs.locator("#receipts")).toContainText("Not in the folder yet");
  await docs.getByRole("button", { name: /^Save 1 receipt in the car's folder \(unsigned\)$/ }).click();
  await expect(docs.locator("#receipts")).toContainText("Unsigned copy in the folder", { timeout: 30_000 });
  // the copy shows with the car's files, but it is not read as a car document
  await expect(docs.locator("#papers")).toContainText("RECEIPT-", { timeout: 30_000 });
  await expect(docs.getByRole("button", { name: /^Save .* in the car's folder \(unsigned\)$/ })).toHaveCount(0);

  // Sales have the same button on the car's page
  const sales = await as(browser, "sales");
  await sales.goto("/documents/ZZT7003");
  await expect(sales.locator("#receipts")).toContainText("Unsigned copy in the folder");
  await docs.close(); await sales.close();
});
