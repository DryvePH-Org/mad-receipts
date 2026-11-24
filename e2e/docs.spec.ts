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

/** Opens a tab of the car's page and waits until it is the open one (a click while the page refreshes by itself can be lost, so it is tried again). */
async function openTab(page: Page, name: string) {
  const tab = page.getByRole("tab", { name: new RegExp(`^${name}`) });
  await expect(async () => { await tab.click(); await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 3000 }); }).toPass({ timeout: 30_000 });
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
  test.setTimeout(420_000); // the longest flow: three cars, two roles, every step
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
  await docs.getByRole("button", { name: /^Filters/ }).click();
  await docs.getByLabel("Drive folder").selectOption("available");
  await expect(docs.getByRole("link", { name: /ZZT.?7001/ }).first()).toBeVisible();
  await expect(docs.getByRole("link", { name: /ZZT.?7004/ })).toHaveCount(0);
  await docs.getByLabel("Drive folder").selectOption("none");
  await expect(docs.getByRole("link", { name: /ZZT.?7004/ }).first()).toBeVisible();
  await docs.getByLabel("Drive folder").selectOption("all");
  await docs.getByLabel("Search cars").fill("");

  // several folders: choose one
  await docs.getByRole("link", { name: /ZZT-7002|ZZT 7002/ }).first().click();
  await openTab(docs, "IN documents");
  await expect(docs.getByText("More than one folder matches this plate")).toBeVisible();
  await docs.getByRole("button", { name: "Use this one" }).first().click();
  await expect(docs.locator("#papers")).toBeVisible();

  // the clean car: read the three photos in the folder
  await docs.goto("/documents/ZZT7001?tab=documents");
  await expect(docs.getByText(/Plate ZZT.?7001/)).toBeVisible();
  await expect(docs.getByText("All scanned")).toBeVisible({ timeout: 30_000 }); // read automatically, nobody pressed anything
  // the OR and the CR are one photo; the ID belongs to the owner on the CR; the deed is seller to dealership
  await expect(docs.getByText("Official receipt (OR)").first()).toBeVisible();
  await expect(docs.getByText("ID of the registered owner").first()).toBeVisible();
  const missingBefore = docs.locator("#papers li", { hasText: "Missing" });
  await expect(missingBefore).toHaveCount(0); // every IN paper is in; the buyer's ID, the signed deed and the AR are OUT documents, on their own tab

  // a correction by one person shows in the Papers part at once, and for another person without reloading
  const other = await as(browser, "docs");
  await other.goto("/documents/ZZT7001?tab=documents");
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
  // the details about the car: which owner, the dealership it was bought from, and the EV extras (nothing is saved here)
  await docs.goto("/documents/ZZT7001?tab=details");
  await docs.locator("#about summary").click();
  await expect(docs.getByLabel(/Which owner is this/)).toBeVisible();
  await expect(docs.getByLabel("Dealership the car was bought from")).toBeVisible();
  await docs.getByLabel(/Which owner is this/).fill("2");
  await expect(docs.getByText("Second owner", { exact: true })).toBeVisible();
  await expect(docs.getByLabel("Wall charger")).toHaveCount(0); // only for an electric car
  await docs.getByLabel("Electric car?").selectOption("phev");
  for (const name of ["Wall charger", "Portable charger", "Key card", "Charging card"]) await expect(docs.getByLabel(name)).toBeVisible();
  await expect(docs.getByLabel("Electric car?").locator("option")).toHaveText(["No", "EV", "PH EV"]);
  await docs.goto("/documents/ZZT7001?tab=documents");

  // Sales: the plate leads to the right car, then the papers go in
  const sales = await as(browser, "sales");
  await expect(sales.getByRole("link", { name: "Car documents" }).first()).toBeVisible(); // everyone can look, nobody but Documentation and Admin can act
  const viewer = await as(browser, "marketing");
  await viewer.goto("/documents/ZZT7001/transmittal"); // Online Marketing only look: no transmittal
  await expect(viewer.getByText("You don't have access to this page.")).toBeVisible();
  // Online Marketing only look at the car page: the photos and what the bot read, no button to change anything
  await viewer.goto("/documents/ZZT7001?tab=documents"); // the car page for Online Marketing: all the information and the photos, no action button
  await expect(viewer.locator("#papers")).toBeVisible();
  await expect(viewer.locator("#papers img").first()).toBeVisible(); // they can see the photos
  await viewer.locator("#papers li", { hasText: "Official receipt (OR)" }).click(); // and open a paper: the photo large and what the bot read, with no button to change it
  await expect(viewer.getByRole("dialog").getByRole("button", { name: "Zoom in" })).toBeVisible(); // the photo is large, with its zoom controls
  await expect(viewer.getByRole("dialog").getByRole("button", { name: "Change what this is" })).toHaveCount(0);
  await viewer.keyboard.press("Escape");
  await expect(viewer.getByRole("button", { name: "Approve: documents are OK" })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: /^Scan / })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "Upload documents" })).toHaveCount(0);
  await expect(viewer.getByRole("button", { name: "Change what this is" })).toHaveCount(0);
  await expect(viewer.getByRole("combobox", { name: "Case" })).toBeDisabled();
  await expect(viewer.getByText("Activity on this car")).toBeVisible(); // the history is there for everyone to read
  await expect(viewer.getByRole("tab", { name: /^OUT documents/ })).toHaveCount(0); // money and the after-sale papers are not for Online Marketing
  await viewer.close();
  await sales.goto("/documents/ZZT7001?tab=payments");
  // Sales add the OUT documents here (the AR's buyer is shown)
  await expect(sales.locator("#sold-upload")).toContainText(BUYER);
  await expect(sales.getByText("Still needed")).toHaveCount(3); // the signed AR, the buyer's ID and the deed
  // a plate nobody has sold never gets a photo, whatever is sent to the server
  const refused = await sales.request.post("/api/docs/upload", { multipart: { plate: "ZZT 9999", file: { name: "p.jpg", mimeType: "image/jpeg", buffer: JPEG } } });
  expect(refused.status()).toBe(409);
  expect((await refused.json()).error).toMatch(/No sale is recorded for ZZT 9999/);
  // the old page is gone: its address leads to Car documents
  await sales.goto("/upload-documents");
  await expect(sales.getByRole("heading", { name: "Car documents" })).toBeVisible();
  await expect(sales.getByRole("link", { name: "Upload documents" })).toHaveCount(0);
  await sales.goto("/documents/ZZT7001?tab=payments");

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
  await expect(docs.locator("#papers li", { hasText: "Buyer's ID" })).toHaveCount(0); // the OUT documents are not in the IN list ...
  await docs.getByRole("tab", { name: /^OUT documents/ }).click();
  const outList = docs.getByRole("list", { name: "After-sale documents" });
  await expect(outList).toContainText("Buyer's ID"); // ... they are on the OUT documents tab, with every AR that was uploaded under the signed AR
  await expect(outList).toContainText("Signed AR");
  await expect(outList.getByText("In the folder").first()).toBeVisible();
  await docs.goto("/documents/ZZT7001?tab=documents");
  // the activity history on the approval card: who did what, with the date and time
  const activity = docs.getByRole("list", { name: "Activity on this car" });
  await expect(activity).toContainText("Uploaded an OUT document, read as"); // what Sales added, and what it was read as
  await expect(activity.locator("time").first()).toBeVisible();

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
  await expect.poll(async () => (await (adminClient() as unknown as { from: (t: string) => any }).from("docs_units_current").select("stock_state").eq("plate_no", "ZZT7001").maybeSingle()).data, { timeout: 15_000 }).toMatchObject({ stock_state: "Sold" }); // eslint-disable-line @typescript-eslint/no-explicit-any
  await docs.goto("/documents/ZZT7001?tab=sale");
  await expect(docs.getByText("Handoff to").first()).toBeVisible();

  // Documentation hands the papers off; from here only an Admin can correct things, and every correction asks first
  await docs.getByRole("button", { name: /^Handed off to/ }).click();
  await docs.getByRole("dialog").getByRole("button", { name: "Go on anyway" }).click();
  await expect(docs.getByText(/^Handed off on/).first()).toBeVisible({ timeout: 20_000 });
  await expect(docs.getByText("Admin: correct this handoff")).toHaveCount(0);
  await expect(docs.getByRole("button", { name: /Withdraw the approval/ })).toHaveCount(0);
  const admin = await as(browser, "admin");
  await admin.goto("/documents/ZZT7001?tab=details");
  // a change to the car's information asks first: Cancel keeps it as it was, the second time it goes through
  await admin.locator("#about summary").click();
  await admin.locator("#ud-note").fill("Corrected by the Admin");
  await admin.getByRole("button", { name: "Save the details" }).click();
  await expect(admin.getByRole("heading", { name: "Change a car that is already sold?" })).toBeVisible();
  await admin.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  expect(((await adminClient().from("docs_units_current" as never).select("condition_note" as never).eq("plate_no", "ZZT7001").maybeSingle()) as unknown as { data: { condition_note?: string } | null }).data?.condition_note ?? "").not.toBe("Corrected by the Admin");
  await admin.getByRole("button", { name: "Save the details" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Yes, change this" }).click();
  await expect.poll(async () => ((await adminClient().from("docs_units_current" as never).select("condition_note" as never).eq("plate_no", "ZZT7001").maybeSingle()) as unknown as { data: { condition_note?: string } | null }).data?.condition_note, { timeout: 20_000 }).toBe("Corrected by the Admin");
  // the handoff: change the note, then take it back
  await openTab(admin, "Sale and transfer");
  await admin.locator("#ho-note-admin").fill("Fixed note");
  await admin.getByRole("button", { name: "Save the ticks and note" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Yes, save the changes" }).click();
  await expect(admin.getByText(/Handed off on .*Fixed note/)).toBeVisible({ timeout: 20_000 });
  await admin.getByRole("button", { name: "Undo the handoff" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Yes, undo it" }).click();
  await expect(admin.getByText("Not handed off").first()).toBeVisible({ timeout: 20_000 });
  // and the approval can be withdrawn, so it can be approved again
  await openTab(admin, "IN documents");
  await admin.getByRole("button", { name: "Withdraw the approval (Admin)" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Yes, withdraw it" }).click();
  await expect(admin.getByText("Not approved yet").first()).toBeVisible({ timeout: 20_000 });
  await admin.close();

  // the transfer goes on after the papers are back: released (to whom, when), then delivered. They are steps of the car's sale record
  await docs.goto("/documents/ZZT7001?tab=sale");
  await docs.getByRole("button", { name: /^Handed off to/ }).click();
  await docs.getByRole("dialog").getByRole("button", { name: "Go on anyway" }).click();
  await expect(docs.getByText(/^Handed off on/).first()).toBeVisible({ timeout: 20_000 });
  const rec = async () => (await adminClient().from("car_sales").select("stage, handed_off_at, back_at, released_on, delivered_on, done_on, originals_at, next_step").eq("plate_no", "ZZT7001").neq("stage", "cancelled")).data ?? [];
  expect((await rec()).length).toBe(1);
  expect((await rec())[0]).toMatchObject({ stage: "in_process", back_at: null });
  const list = await as(browser, "docs"); // the list of documents that are out comes from the same record
  await list.goto("/documents/handoff");
  await expect(list.getByRole("link", { name: /ZZT.?7001/ }).first()).toBeVisible({ timeout: 20_000 });
  await list.close();
  await docs.getByRole("button", { name: "Mark as done: documents are back" }).click();
  await expect(docs.getByText("The originals are back at MAD.")).toBeVisible({ timeout: 20_000 });
  expect((await rec())[0]).toMatchObject({ stage: "transferred", originals_at: "on hand at MAD" });
  await docs.getByLabel("Given to").fill("GDFI");
  await docs.getByRole("button", { name: "Released", exact: true }).click();
  await expect(docs.getByText(/^Released on /)).toBeVisible({ timeout: 20_000 });
  expect((await rec())[0]).toMatchObject({ stage: "released", originals_at: "with GDFI" });
  await docs.getByRole("button", { name: /Delivered: they have it/ }).click();
  await expect(docs.getByText(/The transfer is finished/)).toBeVisible({ timeout: 20_000 });
  expect((await rec())[0]).toMatchObject({ stage: "delivered" });
  expect((await rec())[0].done_on).toBeTruthy();
  const boss = await as(browser, "admin");  // an Admin can take the last step back
  await boss.goto("/documents/ZZT7001?tab=sale");
  await boss.getByRole("button", { name: "Go back one step" }).click();
  await boss.getByRole("dialog").getByRole("button", { name: "Yes, go back one step" }).click();
  await expect.poll(async () => (await rec())[0].stage, { timeout: 20_000 }).toBe("released");
  await boss.close();

  // a car that is not approved cannot be moved (only an Admin may go past that), and it says why
  await docs.goto("/documents/ZZT7002?tab=documents");
  await expect(docs.getByRole("button", { name: "Move to Sold" })).toBeDisabled();
  await expect(docs.getByText(/Approve the documents first\./).first()).toBeVisible();
  await expect(docs.getByRole("button", { name: /Move anyway/ })).toHaveCount(0); // that button is the Admin's

  await tidy();
  await docs.close(); await sales.close(); await cron.dispose();
});

test("Add a car: a quick scan of the LTO photo fills the empty boxes and saves nothing", async ({ browser }) => {
  const docs = await as(browser, "docs");
  await docs.goto("/documents/add");
  await docs.getByLabel("Plate number").fill("ZZT 7011");
  await expect(docs.getByText("This plate is not in MAD yet")).toBeVisible();
  await docs.getByLabel("Color *").fill("black"); // what is already typed is kept
  await expect(async () => { await docs.locator("#scan-photo").setInputFiles({ name: "blurry.jpg", mimeType: "image/jpeg", buffer: JPEG }); await expect(docs.getByText(/too blurry/)).toBeVisible({ timeout: 4000 }); }).toPass({ timeout: 30_000 });
  await docs.locator("#scan-photo").setInputFiles({ name: "lto.jpg", mimeType: "image/jpeg", buffer: JPEG });
  await expect(docs.getByText(/Filled from the photo/)).toBeVisible({ timeout: 30_000 });
  await expect(docs.getByLabel("Brand *")).toHaveValue("NISSAN");
  await expect(docs.getByLabel("Make *")).toHaveValue("TERRA 2.5L EL M");
  await expect(docs.getByLabel("Model (year) *")).toHaveValue("2019");
  await expect(docs.getByLabel("Color *")).toHaveValue("black");
  // nothing was saved: no folder row, no file, no car
  const db = adminClient();
  expect((await db.from("folder_files").select("id").eq("plate_no", "ZZT7011")).data?.length ?? 0).toBe(0);
  expect(((await db.from("docs_units_current" as never).select("id" as never).eq("plate_no", "ZZT7011")) as unknown as { data: unknown[] }).data?.length ?? 0).toBe(0);
  await docs.getByRole("button", { name: "Undo" }).click();
  await expect(docs.getByLabel("Brand *")).toHaveValue("");
  await docs.close();
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
  await expect(async () => { await docs.getByRole("button", { name: "Save the car" }).click(); await expect(docs.getByText("Type the brand.")).toBeVisible({ timeout: 3000 }); }).toPass({ timeout: 30_000 }); // the page may still be waking up
  await docs.getByLabel("Brand *").fill("toyota"); await docs.getByLabel("Make *").fill("vios 1.3 e");
  await docs.getByLabel("Model (year) *").fill("2019"); await docs.getByLabel("Color *").fill("white");
  await expect(async () => { await docs.locator("#staged-photos").setInputFiles({ name: "y.jpg", mimeType: "image/jpeg", buffer: JPEG }); await expect(docs.getByText("1 photo chosen")).toBeVisible({ timeout: 3000 }); }).toPass({ timeout: 30_000 }); // chosen in the form: it goes to Drive right after the car is saved
  await docs.getByRole("button", { name: "Save the car and upload 1 document" }).click();
  await expect(docs.getByText(/is in MAD/)).toBeVisible();
  await expect(docs.getByText(/The team has been told/)).toBeVisible({ timeout: 30_000 });
  const row = await adminClient().from("docs_units_current" as never).select("make, year_model, color, source, stock_state" as never).eq("plate_no", "ZZT7010").single() as unknown as { data: Record<string, string> };
  expect(row.data).toMatchObject({ make: "TOYOTA", year_model: "19", color: "WHITE", source: "app", stock_state: "Onhand" });
  await docs.locator("#add-photos").setInputFiles({ name: "x.jpg", mimeType: "image/jpeg", buffer: JPEG });
  await expect(docs.getByText("Saved ✓")).toBeVisible({ timeout: 30_000 });
  await expect(docs.getByText(/The team has been told/)).toBeVisible({ timeout: 30_000 });
  // an iPhone photo (HEIC): the page turns it into a JPEG itself
  await docs.locator("#add-photos").setInputFiles("e2e/fixtures/sample.heic");
  await expect(docs.getByRole("listitem").filter({ hasText: "sample.heic" }).getByText("Saved ✓")).toBeVisible({ timeout: 60_000 });
  // and one the stand-in reader knows by its name
  const res = await docs.request.post("/api/docs/add", { multipart: { plate: "ZZT 7010", label: "cr-or", file: { name: "p.jpg", mimeType: "image/jpeg", buffer: JPEG } } });
  expect(res.ok()).toBe(true);
  expect((await res.json()).result.types).toContain("official_receipt");
  // the car now has its folder and both files
  await docs.goto("/documents/ZZT7010?tab=documents");
  await expect(docs.locator("#papers")).toBeVisible();
  await expect(docs.getByText("Official receipt (OR)").first()).toBeVisible();

  // a photo opens in the zoom viewer (+, −, Fit), and Documentation can remove it from the folder (after a question)
  await docs.locator("#papers li", { hasText: "Official receipt (OR)" }).click();
  const dialog = docs.getByRole("dialog");
  await expect(dialog.getByRole("region", { name: "Preview" })).toBeVisible(); // the viewer fills the window: the photo, with its controls and details beside it
  await expect(dialog.getByRole("complementary", { name: "Details and controls" })).toBeVisible();
  await expect(docs.getByRole("button", { name: "Zoom in" })).toBeVisible();
  await docs.getByRole("button", { name: "Zoom in" }).click();
  await expect(docs.getByText("150%")).toBeVisible();
  await docs.getByRole("button", { name: "Fit" }).click();
  await expect(docs.getByText("100%")).toBeVisible();
  await dialog.getByRole("button", { name: "Remove this photo" }).first().click();
  await expect(dialog.getByText(/goes to the Drive trash for 30 days/)).toBeVisible();
  await dialog.getByRole("button", { name: "Keep it" }).click();
  await expect(dialog.getByRole("button", { name: "Remove this photo" }).first()).toBeVisible();
  const before = (await adminClient().from("folder_files").select("id").eq("plate_no", "ZZT7010")).data?.length ?? 0;
  await dialog.getByRole("button", { name: "Remove this photo" }).first().click();
  await dialog.getByRole("button", { name: "Yes, remove it" }).click();
  await expect(async () => expect((await adminClient().from("folder_files").select("id").eq("plate_no", "ZZT7010")).data?.length ?? 0).toBe(before - 1)).toPass({ timeout: 30_000 });

  // only an Admin can remove the car itself; Documentation does not see the button
  await docs.goto("/documents/ZZT7010?tab=details");
  await expect(docs.getByText("Repairs of this car")).toBeVisible();
  await expect(docs.getByRole("button", { name: "Remove this car" })).toHaveCount(0);
  const admin = await as(browser, "admin");
  await admin.goto("/documents/ZZT7010?tab=details");
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
  await expect(docs.getByRole("link", { name: "Add a car" })).toBeVisible(); // Buying add a car from the menu
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
  await docs.goto("/documents/ZZT7003?tab=receipts");
  await expect(docs.getByRole("tab", { name: /^Receipts/ })).toBeVisible();
  // a saved receipt is offered at once, and it is not in the folder until the button is pressed
  expect((await adminClient().from("receipts").select("status").eq("id", receiptId).single()).data?.status).toBe("approved");
  await expect(docs.locator("#receipts")).toContainText("Not in the folder yet");
  await docs.getByRole("button", { name: /^Save 1 receipt in the car's folder \(unsigned\)$/ }).click();
  await expect(docs.locator("#receipts")).toContainText("Unsigned copy in the folder", { timeout: 30_000 });
  // the copy shows with the car's files, but it is not read as a car document
  await openTab(docs, "IN documents");
  await expect(docs.locator("#papers")).toContainText("RECEIPT-", { timeout: 30_000 });
  await expect(docs.getByRole("button", { name: /^Save .* in the car's folder \(unsigned\)$/ })).toHaveCount(0);

  // one page for the car: it opens on the Overview, each tab has its own address, and a link to a part of a page opens the tab that holds it
  await docs.goto("/documents/ZZT7003");
  await expect(docs.getByRole("tab", { name: /^Overview/ })).toHaveAttribute("aria-selected", "true");
  for (const block of ["Status", "Documents", "Sale", "Transfer of the originals", "Repairs", "Needs a person"]) await expect(docs.getByRole("main").locator('[data-slot="card-title"]', { hasText: block }).first()).toBeVisible();
  await openTab(docs, "Sale and transfer");
  await expect(docs).toHaveURL(/tab=sale/);
  await expect(docs.getByText("Handoff to").first()).toBeVisible();
  await docs.goto("/documents/ZZT7003#papers"); // an old link to a part of the page
  await expect(docs.getByRole("tab", { name: /^IN documents/ })).toHaveAttribute("aria-selected", "true", { timeout: 20_000 });
  await expect(docs.locator("#papers")).toBeVisible();

  // Sales have the same button on the car's page
  const sales = await as(browser, "sales");
  await sales.goto("/documents/ZZT7003?tab=receipts");
  await expect(sales.locator("#receipts")).toContainText("Unsigned copy in the folder");
  for (const t of ["Overview", "IN documents", "OUT documents", "Sale and transfer", "Receipts", "Details"]) await expect(sales.getByRole("tab", { name: new RegExp(`^${t}`) })).toBeVisible();
  await docs.close(); await sales.close();
});

test("an Admin deletes a whole transaction: only after typing the deal number, and everything on it goes", async ({ browser }) => {
  test.setTimeout(120_000);
  const ar = await makeAr("ZZT 7020");
  const db = adminClient();
  const deal = (await db.from("deals").select("deal_no").eq("id", ar.deal_id).single()).data!;
  const receiptNo = (await db.from("receipts").select("receipt_no").eq("deal_id", ar.deal_id).single()).data!.receipt_no;

  // only an Admin sees the box
  const docs = await as(browser, "docs");
  await docs.goto(`/deals/${ar.deal_id}`);
  await expect(docs.getByText("Delete this transaction (Admin)")).toHaveCount(0);
  await docs.close();

  const admin = await as(browser, "admin");
  await admin.goto(`/deals/${ar.deal_id}`);
  await admin.getByText("Delete this transaction (Admin)").click();
  await admin.getByRole("button", { name: `Delete ${deal.deal_no}` }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel(`Type ${deal.deal_no}`).fill("D0");
  await dialog.getByRole("button", { name: "Yes, delete it" }).click();
  await expect(dialog.getByText(/Type the deal number/)).toBeVisible(); // a wrong number deletes nothing
  expect((await db.from("deals").select("id").eq("id", ar.deal_id)).data).toHaveLength(1);
  await dialog.getByLabel(`Type ${deal.deal_no}`).fill(deal.deal_no.toLowerCase());
  await dialog.getByRole("button", { name: "Yes, delete it" }).click();
  await admin.waitForURL("**/deals", { timeout: 30_000 });

  expect((await db.from("deals").select("id").eq("id", ar.deal_id)).data).toHaveLength(0);
  expect((await db.from("receipts").select("id").eq("receipt_no", receiptNo)).data).toHaveLength(0);
  expect((await db.from("deal_units").select("id").eq("deal_id", ar.deal_id)).data).toHaveLength(0);
  expect((await db.from("audit_logs").select("id").eq("action", "deal.delete").order("created_at", { ascending: false }).limit(1)).data).toHaveLength(1);
  made.pop(); // already gone
  await admin.close();
});

test("Sales and transfers: the stages filter the list, what is flagged waits for 'Checked', and a change made here is kept", async ({ browser }) => {
  test.setTimeout(120_000);
  const db = adminClient() as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const row = (plate: string, over: Record<string, unknown>) => ({ plate_no: plate, buyer: "ZZT E2E BUYER", sales: "DAVID", source: "import", sold_on: "2026-03-10", agreed_price: 500000, route: "unknown", stage: "in_process", is_reference: false, flags: [], liaison: null, originals_at: null, ...over }); // every row names the same columns: a bulk insert sends null for a missing one
  await db.from("car_sales").delete().like("plate_no", "ZZT95%");
  const ins = await db.from("car_sales").insert([
    row("ZZT9501", { stage: "in_process", route: "mad", liaison: "JEP", originals_at: "with Jep" }),
    row("ZZT9502", { stage: "delivered", route: "mad" }),
    row("ZZT9503", { stage: "unknown", is_reference: true, flags: ["the transfer status is not known (this tab is old): a person checks it"] }),
    row("ZZT9504", { stage: "released", flags: ["no agreed price"], agreed_price: null }),
  ]);
  expect(ins.error).toBeNull();

  const docs = await as(browser, "docs");
  await docs.goto("/documents/transfers");
  await expect(docs.getByRole("heading", { name: "Sales and transfers" })).toBeVisible();
  await docs.getByLabel("Search transfers").fill("ZZT95");
  // the default list is the work that is open: not delivered and not an old row
  await expect(docs.getByText("ZZT9501")).toBeVisible();
  await expect(docs.getByText("ZZT9504")).toBeVisible();
  await expect(docs.getByText("ZZT9502")).toHaveCount(0);
  await expect(docs.getByText("ZZT9503")).toHaveCount(0);
  await docs.getByRole("tab", { name: /^Delivered/ }).click();
  await expect(docs.getByText("ZZT9502")).toBeVisible();
  await docs.getByRole("tab", { name: /^Old list/ }).click();
  await expect(docs.getByText("ZZT9503")).toBeVisible();
  await docs.getByRole("tab", { name: /^To check/ }).click();
  await expect(docs.getByText("ZZT9504")).toBeVisible();

  // open the flagged one: it says what to look at; "Checked" clears it and the record is then protected from a later import
  const flagged = docs.locator("li", { hasText: "ZZT9504" });
  await flagged.getByText("ZZT9504").click();
  await expect(flagged.getByText("no agreed price").first()).toBeVisible();
  await flagged.getByRole("button", { name: "Checked, it is fine" }).click();
  await expect(docs.getByText("ZZT9504")).toHaveCount(0, { timeout: 20_000 }); // it left "To check"
  const checked = (await db.from("car_sales").select("flags, edited_in_app").eq("plate_no", "ZZT9504").single()).data;
  expect(checked).toEqual({ flags: [], edited_in_app: true });

  // change the stage and the price of the first one
  await docs.getByRole("tab", { name: /^Not delivered/ }).click();
  const first = docs.locator("li", { hasText: "ZZT9501" });
  await first.getByText("ZZT9501").click();
  await first.getByLabel("Stage").selectOption("transferred");
  await first.getByLabel("Agreed price (₱)").fill("₱ 650,000");
  await first.getByRole("button", { name: "Save", exact: true }).click();
  await expect(first.getByText("Saved.")).toBeVisible({ timeout: 20_000 });
  const saved = (await db.from("car_sales").select("stage, agreed_price, edited_in_app").eq("plate_no", "ZZT9501").single()).data;
  expect([saved.stage, Number(saved.agreed_price), saved.edited_in_app]).toEqual(["transferred", 650000, true]);

  // Online Marketing have no access to the buyers' details
  const sales = await as(browser, "marketing");
  await sales.goto("/documents/transfers");
  await expect(sales.getByText("You don't have access to this page.")).toBeVisible();
  await db.from("car_sales").delete().like("plate_no", "ZZT95%");
  await docs.close(); await sales.close();
});

test("A sold list row without a plate waits in the Data check; typing the plate makes it a sale", async ({ browser }) => {
  test.setTimeout(120_000);
  const db = adminClient() as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  await db.from("docs_review_items").delete().eq("payload->>rowKey", "sold|ZZT|1");
  await db.from("car_sales").delete().like("plate_no", "ZZT96%");
  const payload = {
    rowKey: "sold|ZZT|1", keyParts: { tab: "transfer tab", date: "2026-04-01", buyer: "ZZTE2EBUYER" }, fillUnit: {},
    fields: { buyer: "ZZT E2E BUYER", sales: "DAVID", sold_on: "2026-04-01", agreed_price: 700000, route: "mad", stage: "released", is_reference: false, flags: ["plate: a date was typed where the plate goes."], car_text: "2025 BYD SHARK 6", source: "import" },
  };
  const ins = await db.from("docs_review_items").insert({ kind: "sold_no_plate", plate_no: null, message: "Sold list, transfer tab, row 1: the plate \"4744-11-01\" cannot be used. ZZT E2E BUYER bought 2025 BYD SHARK 6.", source_row: 1, payload });
  expect(ins.error).toBeNull();

  const docs = await as(browser, "docs");
  await docs.goto("/data-check?tab=move");
  const item = docs.locator("li", { hasText: "ZZT E2E BUYER bought 2025 BYD SHARK 6" });
  await expect(item).toBeVisible({ timeout: 30_000 });
  await expect(item).toContainText("Sold row without a plate");
  await item.getByLabel("Plate number of the sale").fill("zzt 9601");
  await item.getByRole("button", { name: "Record the sale" }).click();
  await expect.poll(async () => (await db.from("car_sales").select("plate_no, buyer, stage, source_key, flags").eq("plate_no", "ZZT9601")).data?.length, { timeout: 20_000 }).toBe(1);
  const t = (await db.from("car_sales").select("plate_no, buyer, stage, agreed_price, source_key, flags, unit_id").eq("plate_no", "ZZT9601").single()).data;
  expect([t.buyer, t.stage, Number(t.agreed_price), t.unit_id]).toEqual(["ZZT E2E BUYER", "released", 700000, null]); // MAD has no such car: the sale keeps the car as the sheet described it
  expect(t.source_key).toBe("ft|ZZT9601|2026-04-01|ZZTE2EBUYER");
  expect(t.flags.join(" ")).toContain("typed by a person");
  expect(t.flags.join(" ")).not.toContain("a date was typed");
  expect((await db.from("docs_review_items").select("status").eq("payload->>rowKey", "sold|ZZT|1").single()).data.status).toBe("resolved");
  await db.from("docs_review_items").delete().eq("payload->>rowKey", "sold|ZZT|1");
  await db.from("car_sales").delete().like("plate_no", "ZZT96%");
  await docs.close();
});

test("A saved receipt makes the sale record of its car, or joins the one that is already there", async ({ browser, playwright, baseURL }) => {
  test.setTimeout(180_000);
  const db = adminClient() as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  await db.from("car_sales").delete().like("plate_no", "ZZT703%");
  // an older record of the sold list, with the same buyer (will be joined), and one of another buyer on another car (a new record is made)
  await db.from("car_sales").insert([
    { plate_no: "ZZT7031", buyer: "ZZT E2E DOCS BUYER", source: "import", sold_on: null, agreed_price: null, stage: "released", route: "mad", is_reference: false, flags: [], sales: null },
    { plate_no: "ZZT7032", buyer: "SOMEONE ELSE ENTIRELY", source: "import", sold_on: "2026-02-02", agreed_price: 100000, stage: "delivered", route: "mad", is_reference: false, flags: [], sales: "ELLA" },
  ]);
  const a = await makeAr("ZZT 7030"), b = await makeAr("ZZT 7031"), c = await makeAr("ZZT 7032");
  const cron = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { "x-cron-secret": cronSecret() } });
  expect((await cron.post("/api/sync/run")).ok()).toBe(true);
  const recs = async (plate: string) => (await db.from("car_sales").select("buyer, agreed_price, sold_on, sales, stage, deal_id, source, source_key").eq("plate_no", plate)).data as Record<string, unknown>[];

  // a new car: a new record, from the deal, ready for its transfer
  await expect.poll(async () => (await recs("ZZT7030")).length, { timeout: 30_000 }).toBe(1);
  const made = (await recs("ZZT7030"))[0];
  expect([made.buyer, Number(made.agreed_price), made.stage, made.deal_id, made.source]).toEqual(["ZZT E2E DOCS BUYER", 500000, "in_process", a.deal_id, "app"]);
  expect(made.source_key).toBe(`deal|${a.deal_id}|ZZT7030`);
  // the same buyer's older record is joined to the deal, not doubled; what it had stays, what it lacked is filled
  await expect.poll(async () => (await recs("ZZT7031"))[0]?.deal_id, { timeout: 30_000 }).toBe(b.deal_id);
  const joined = await recs("ZZT7031");
  expect(joined).toHaveLength(1);
  expect([joined[0].stage, Number(joined[0].agreed_price), joined[0].sold_on]).toEqual(["released", 500000, "2026-11-05"]);
  // another buyer's record stays as it is, and the new sale gets its own
  await expect.poll(async () => (await recs("ZZT7032")).length, { timeout: 30_000 }).toBe(2);
  expect((await recs("ZZT7032")).find((r) => !r.deal_id)).toMatchObject({ buyer: "SOMEONE ELSE ENTIRELY", stage: "delivered" });
  // running the jobs again changes nothing
  await db.from("sync_jobs").update({ status: "pending", attempts: 0, next_run_at: new Date().toISOString() }).eq("target", "docs").in("receipt_id", made ? (await db.from("receipts").select("id").in("deal_id", [a.deal_id, b.deal_id, c.deal_id])).data.map((x: { id: string }) => x.id) : []);
  expect((await cron.post("/api/sync/run")).ok()).toBe(true);
  expect((await recs("ZZT7030")).length + (await recs("ZZT7031")).length + (await recs("ZZT7032")).length).toBe(4);

  // the deal page and the Transfers list show the link both ways
  const admin = await as(browser, "admin");
  await admin.goto(`/deals/${a.deal_id}`);
  await expect(admin.getByRole("link", { name: /ZZT7030: In process/ })).toBeVisible({ timeout: 20_000 });
  await admin.goto("/documents/transfers");
  await admin.getByLabel("Search transfers").fill("ZZT7030");
  await admin.locator("li", { hasText: "ZZT7030" }).getByText("ZZT7030").first().click();
  await expect(admin.getByText(/Made in the app/)).toBeVisible();
  // deleting the transaction deletes the record it made
  await admin.goto(`/deals/${a.deal_id}`);
  await admin.getByText("Delete this transaction (Admin)").click();
  const dealNo = (await db.from("deals").select("deal_no").eq("id", a.deal_id).single()).data.deal_no;
  await admin.getByRole("button", { name: `Delete ${dealNo}` }).click();
  await admin.getByRole("dialog").getByLabel(`Type ${dealNo}`).fill(dealNo);
  await admin.getByRole("dialog").getByRole("button", { name: "Yes, delete it" }).click();
  await admin.waitForURL("**/deals", { timeout: 30_000 });
  expect(await recs("ZZT7030")).toHaveLength(0);
  if (made) await db.from("car_sales").delete().like("plate_no", "ZZT703%");
  await admin.close();
});

test("Payments: the sale is added by hand, the status is set, a payment paper is kept, and Online Marketing sees none of it", async ({ browser }) => {
  test.setTimeout(150_000);
  const db = adminClient() as unknown as { from: (t: string) => { upsert: (v: object, o?: object) => Promise<{ error: unknown }>; delete: () => { like: (c: string, v: string) => Promise<unknown> } } };
  // a car with a linked folder (the one the stand-in Drive keeps for ZZT-7003) and no sale of its own
  await db.from("unit_folders").delete().like("plate_no", "ZZT7003"); // a Drive folder belongs to one car: the earlier test is done with it
  const seeded = await db.from("unit_folders").upsert({ plate_no: "ZZT7005", plate_display: "ZZT 7005", folder_id: "mock-folder-7", folder_name: "21 Ford Escape (ZZT-7005)", folder_url: "https://drive.example.test/folders/mock-folder-7", location: "sold", match_status: "linked" }, { onConflict: "plate_no" });
  expect(seeded.error).toBeNull();

  const docs = await as(browser, "docs");
  await docs.goto("/documents/ZZT7005?tab=payments");
  await expect(docs.locator("#add-sale")).toBeVisible({ timeout: 30_000 });
  await expect(docs.getByText("The payment status can be set once the sale is added.")).toBeVisible();
  await docs.getByText("No AR to upload? Add the sale by hand").click();
  await docs.getByLabel("Buyer", { exact: true }).fill("ZZT E2E Pay Buyer");
  await docs.getByLabel(/Agreed price/).fill("588,000");
  await docs.getByLabel("Salesperson").fill("ZZT E2E Seller");
  await docs.getByRole("button", { name: "Add the sale" }).click();
  await expect(docs.getByRole("group", { name: "Payment status" })).toBeVisible({ timeout: 30_000 });
  await expect(docs.locator("#add-sale")).toHaveCount(0);

  // the status is one tap, and tapping it again clears it
  const partly = docs.getByRole("button", { name: "Partly paid", exact: true });
  await partly.click();
  await expect(partly).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
  await expect(docs.getByRole("tab", { name: /^OUT documents/ })).toBeVisible();

  // a payment paper: what it is, the amount, the date; it appears in the list with a download
  await docs.waitForTimeout(2000); // the page must be ready before a file is given to it
  await docs.getByLabel("What are they").selectOption("Down payment");
  await docs.getByLabel(/Amount, if it shows one/).fill("50,000");
  await docs.getByLabel("Note (optional)").fill("BDO deposit slip");
  await docs.locator("#pay-file").setInputFiles({ name: "slip.jpg", mimeType: "image/jpeg", buffer: JPEG });
  await docs.getByRole("button", { name: "Add to the payments" }).click();
  const list = docs.getByRole("list", { name: "Payment papers" });
  await expect(list).toContainText("Down payment", { timeout: 30_000 });
  await expect(list).toContainText("₱50,000");
  await expect(list).toContainText("BDO deposit slip");
  await expect(list.getByRole("link", { name: /Download/ })).toBeVisible();
  // the OUT tab has its own history: the sale and the payment paper, with who did it
  await expect(docs.locator("#out-activity")).toContainText("Added the sale for ZZT E2E PAY BUYER");
  await expect(docs.locator("#out-activity")).toContainText("Added a payment paper: Down payment");
  // it is kept apart from the papers: not on the Papers checklist and not counted as a photo
  await openTab(docs, "IN documents");
  await expect(docs.locator("#papers").getByText(/PAY_/)).toHaveCount(0);
  await docs.close();

  // the Documents list shows and filters by the payment status
  const list2 = await as(browser, "admin");
  await list2.goto("/documents");
  await list2.getByRole("button", { name: /^Filters/ }).click();
  await list2.getByLabel("Payment").selectOption("partial");
  await expect(list2.getByText("ZZT 7005").first()).toBeVisible();
  await list2.close();

  // Online Marketing see no payments: no tab, no money on the list, and the paper itself is not found
  const file = (await adminClient().from("folder_files").select("id").eq("plate_no", "ZZT7005").eq("archive", "payment").single()).data as { id: string };
  const viewer = await as(browser, "marketing");
  await viewer.goto("/documents/ZZT7005");
  await expect(viewer.getByRole("tab", { name: /^Overview/ })).toBeVisible({ timeout: 30_000 });
  await expect(viewer.getByRole("tab", { name: /^OUT documents/ })).toHaveCount(0);
  expect((await viewer.request.get(`/api/docs/file/${file.id}`)).status()).toBe(404);
  await viewer.goto("/documents");
  await viewer.getByRole("button", { name: /^Filters/ }).click();
  await expect(viewer.getByLabel("Payment")).toHaveCount(0);
  await viewer.close();

  await db.from("car_sales").delete().like("plate_no", "ZZT7005");
  await db.from("unit_folders").delete().like("plate_no", "ZZT7005");
});

test("The AR photo makes the sale: the buyer and the date come from it, the AR shows in the payments", async ({ browser }) => {
  test.setTimeout(150_000);
  const db = adminClient() as unknown as { from: (t: string) => { upsert: (v: object, o?: object) => Promise<{ error: unknown }>; delete: () => { like: (c: string, v: string) => Promise<unknown> }; select: (c: string) => { eq: (c: string, v: string) => { single: () => Promise<{ data: Record<string, unknown> | null }> } } } };
  await db.from("unit_folders").delete().like("plate_no", "ZZT7005");
  await db.from("unit_folders").delete().like("plate_no", "ZZT7006");
  const seeded = await db.from("unit_folders").upsert({ plate_no: "ZZT7006", plate_display: "ZZT 7006", folder_id: "mock-folder-7", folder_name: "21 Ford Escape (ZZT-7006)", folder_url: "https://drive.example.test/folders/mock-folder-7", location: "sold", match_status: "linked" }, { onConflict: "plate_no" });
  expect(seeded.error).toBeNull();

  const sales = await as(browser, "sales");
  await sales.goto("/documents/ZZT7006?tab=payments");
  await expect(sales.locator("#sold-upload")).toContainText("No sale is recorded yet", { timeout: 30_000 });
  await expect(sales.getByRole("button", { name: "Choose files" })).toBeVisible();
  await expect(sales.getByText("No AR to upload? Add the sale by hand")).toBeVisible();

  // an ordinary sold-papers upload is refused while the car has no sale; the AR itself is accepted (the stand-in reader knows the buyer from the file label), and the sale is made from it
  // without ar=1 the same upload is refused: no sale, no AR
  const refused = await sales.request.post("/api/docs/upload", { multipart: { plate: "ZZT 7006", label: "ar-Someone", file: { name: "p.jpg", mimeType: "image/jpeg", buffer: JPEG } } });
  expect(refused.status()).toBe(409);
  const res = await sales.request.post("/api/docs/upload", { multipart: { plate: "ZZT 7006", ar: "1", label: "ar-ZZT_E2E_AR_Buyer", file: { name: "p.jpg", mimeType: "image/jpeg", buffer: JPEG } } });
  expect(res.ok()).toBe(true);
  expect((await res.json()).result.types).toContain("acknowledgement_receipt");

  const sale = await db.from("car_sales").select("buyer, sold_on, sales, agreed_price").eq("plate_no", "ZZT7006").single();
  expect(sale.data).toMatchObject({ buyer: "ZZT E2E AR BUYER", sold_on: "2026-11-20", sales: "ZZT E2E SALES", agreed_price: null });

  await sales.goto("/documents/ZZT7006?tab=payments");
  await expect(sales.getByRole("group", { name: "Payment status" })).toBeVisible({ timeout: 30_000 });
  await expect(sales.locator("#sold-upload")).not.toContainText("No sale is recorded yet");
  // every AR that is uploaded falls under the signed AR of the after-sale list, with what the bot read on it
  const out = sales.getByRole("list", { name: "After-sale documents" });
  await expect(out).toContainText("Signed AR");
  await expect(out).toContainText("Buyer ZZT E2E AR Buyer");
  await expect(out).toContainText("₱50,000");
  await expect(out.getByRole("link", { name: /^Open / })).toHaveCount(1);
  // the OUT tab history lists the upload and the sale made from the AR
  await expect(sales.locator("#out-activity")).toContainText("The sale was made from the uploaded AR");
  await expect(sales.locator("#out-activity")).toContainText("Uploaded an OUT document");
  // many files at once: each goes in turn and says how it went; a file that is not a photo says so and can be tried again
  await sales.waitForTimeout(2500);
  await sales.locator("#doc-photos").setInputFiles([
    { name: "b1.jpg", mimeType: "image/jpeg", buffer: JPEG }, { name: "b2.jpg", mimeType: "image/jpeg", buffer: JPEG }, { name: "b3.jpg", mimeType: "image/jpeg", buffer: JPEG },
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a photo") },
  ]);
  await expect(sales.getByText("Saved ✓")).toHaveCount(3, { timeout: 60_000 });
  await expect(sales.getByRole("progressbar", { name: "Upload progress" })).toBeVisible();
  await expect(sales.getByText("3 saved, 1 did not go through")).toBeVisible();
  await expect(sales.getByRole("button", { name: "Try again" })).toBeVisible();
  await sales.getByRole("button", { name: "Clear the saved ones" }).click();
  await expect(sales.getByText("Saved ✓")).toHaveCount(0);
  // a second AR (another payment) falls into the same line: all the ARs are listed
  const second = await sales.request.post("/api/docs/upload", { multipart: { plate: "ZZT 7006", ar: "1", label: "ar-ZZT_E2E_AR_Buyer", file: { name: "p.jpg", mimeType: "image/jpeg", buffer: JPEG } } });
  expect(second.ok()).toBe(true);
  await sales.reload();
  await expect(sales.getByRole("list", { name: "After-sale documents" }).getByRole("link", { name: /^Open / })).toHaveCount(2);
  await expect(sales.getByRole("list", { name: "After-sale documents" })).toContainText("2 in the folder");
  await sales.close();

  await db.from("car_sales").delete().like("plate_no", "ZZT7006");
  await db.from("unit_folders").delete().like("plate_no", "ZZT7006");
});

test("Papers for the new owner: one tap on a paper, or every photo together with each starting as the paper it most likely is", async ({ browser }) => {
  test.setTimeout(180_000);
  const db = adminClient() as unknown as { from: (t: string) => { upsert: (v: object, o?: object) => Promise<{ error: unknown }>; delete: () => { like: (c: string, v: string) => Promise<unknown> } } };
  await db.from("folder_files").delete().like("plate_no", "ZZT7008");
  const seeded = await db.from("unit_folders").upsert({ plate_no: "ZZT7008", plate_display: "ZZT 7008", folder_id: "mock-folder-8", folder_name: "20 Kia Stonic (ZZT-7008)", folder_url: "https://drive.example.test/folders/mock-folder-8", location: "sold", match_status: "linked" }, { onConflict: "plate_no" });
  expect(seeded.error).toBeNull();

  const docs = await as(browser, "docs");
  await docs.goto("/documents/ZZT7008?tab=sale");
  await expect(docs.getByRole("heading", { name: /Documents for the new owner/ })).toBeVisible({ timeout: 30_000 });
  await expect(docs.getByText("0 of 4")).toBeVisible();
  await docs.waitForTimeout(2000); // the page must be ready before a file is given to it

  // one tap on a paper: its photo goes straight in as that paper
  await docs.getByLabel("Add photos of the OR").setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: JPEG });
  await expect(docs.getByText("1 of 4")).toBeVisible({ timeout: 40_000 });

  // everything else together: the name says PNP; the two phone photos take the next papers that have nothing yet (CR, then macro-etching)
  await docs.getByLabel("Photos of the papers for the new owner").setInputFiles([
    { name: "IMG_1.jpg", mimeType: "image/jpeg", buffer: JPEG }, { name: "IMG_2.jpg", mimeType: "image/jpeg", buffer: JPEG }, { name: "pnp.jpg", mimeType: "image/jpeg", buffer: JPEG },
  ]);
  await expect(docs.getByLabel("What is IMG_1.jpg")).toHaveValue("CR");
  await expect(docs.getByLabel("What is IMG_2.jpg")).toHaveValue("Macro-etching");
  await expect(docs.getByLabel("What is pnp.jpg")).toHaveValue("PNP clearance");
  await docs.getByRole("button", { name: "Save 3 papers" }).click();
  await expect(docs.getByText("4 of 4")).toBeVisible({ timeout: 60_000 });

  // they are kept as the new owner's papers, apart from the IN checklist and the payments
  const rows = (await adminClient().from("folder_files").select("archive, archive_tag").eq("plate_no", "ZZT7008")).data as { archive: string; archive_tag: string }[];
  expect(rows.map((r) => `${r.archive}:${r.archive_tag}`).sort()).toEqual(["transfer:CR", "transfer:Macro-etching", "transfer:OR", "transfer:PNP clearance"]);
  await docs.goto("/documents/ZZT7008?tab=documents");
  await expect(docs.getByText(/NEWOWNER_/)).toHaveCount(0);
  await docs.close();
  await db.from("folder_files").delete().like("plate_no", "ZZT7008");
  await db.from("unit_folders").delete().like("plate_no", "ZZT7008");
});
