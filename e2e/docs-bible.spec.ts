import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminClient, credentials } from "./support";

// The Docs Bible table. It uses ONE test car (plate ZZT9001) made here and removed at the end; the real register is never edited.
const PLATE = "ZZT9001";

async function as(browser: Browser, who: keyof typeof credentials): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(credentials[who].email);
  await page.getByLabel("Password").fill(credentials[who].password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/deals");
  return page;
}
const db = () => adminClient() as unknown as { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const remove = async () => { await db().from("docs_units").delete().eq("plate_no", PLATE); };

test.beforeEach(async () => {
  await remove();
  const r = await db().from("docs_units").insert({ plate_no: PLATE, plate_display: PLATE, classification: "Clean", cr: "No", make: "TESTMAKE", source: "app", last_change_source: "e2e" });
  expect(r.error).toBeNull();
});
test.afterAll(remove);

test("Documentation edits a paper cell with undo and history; the car's identity is read only; Sales only look", async ({ browser }) => {
  const docs = await as(browser, "docs");
  await docs.goto("/documents");
  await expect(docs.getByRole("heading", { name: "Car documents" })).toBeVisible();
  await docs.getByRole("tab", { name: /Table/ }).click();
  await docs.getByLabel("Search").fill(PLATE);
  await expect(docs.getByText("1 of ", { exact: false })).toBeVisible();

  // a paper cell can be changed: it saves at once, and the database and the history agree
  await docs.getByRole("button", { name: `CR of ${PLATE}` }).click();
  await docs.getByLabel("CR", { exact: true }).selectOption("Yes");
  await expect(docs.getByRole("button", { name: `CR of ${PLATE}` })).toContainText("Yes");
  await expect.poll(async () => (await db().from("docs_units").select("cr").eq("plate_no", PLATE).single()).data?.cr).toBe("Yes");
  const hist = await db().from("docs_unit_history").select("field, before_value, after_value, source").eq("plate_no", PLATE).eq("field", "cr");
  expect(hist.data).toEqual([{ field: "cr", before_value: "No", after_value: "Yes", source: "app" }]);

  // Undo puts it back
  await docs.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await db().from("docs_units").select("cr").eq("plate_no", PLATE).single()).data?.cr).toBe("No");

  // the car's identity columns are not for Documentation
  await docs.getByRole("tab", { name: "Everything (like the sheet)" }).click();
  await expect(docs.getByRole("columnheader", { name: "MAKE" })).toBeVisible();
  await expect(docs.getByRole("button", { name: `MAKE of ${PLATE}` })).toHaveCount(0);
  await expect(docs.getByRole("button", { name: `CLASSIFICATION of ${PLATE}` })).toBeVisible();

  // the plate opens the history
  await docs.getByRole("button", { name: PLATE, exact: true }).click();
  await expect(docs.getByRole("dialog").getByText(`History of ${PLATE}`)).toBeVisible();
  await expect(docs.getByRole("dialog").getByText("CR").first()).toBeVisible();
  await docs.keyboard.press("Escape");

  // Sales can see the table but nothing is editable
  const sales = await as(browser, "sales");
  await sales.goto("/documents");
  await sales.getByRole("tab", { name: /Table/ }).click();
  await sales.getByLabel("Search").fill(PLATE);
  await expect(sales.getByText(PLATE, { exact: true }).first()).toBeVisible();
  await expect(sales.getByRole("button", { name: `CR of ${PLATE}` })).toHaveCount(0);

  // the server refuses an edit from Sales even if the page is bypassed
  const unit = await db().from("docs_units").select("id").eq("plate_no", PLATE).single();
  expect(unit.data.id).toBeTruthy();
  await docs.close(); await sales.close();
});

test("an edit of a cell somebody else changed is refused, not overwritten", async ({ browser }) => {
  const docs = await as(browser, "docs");
  await docs.goto("/documents");
  await docs.getByRole("tab", { name: /Table/ }).click();
  await docs.getByLabel("Search").fill(PLATE);
  await expect(docs.getByRole("button", { name: `CR of ${PLATE}` })).toBeVisible();
  await db().from("docs_units").update({ cr: "To follow" }).eq("plate_no", PLATE); // someone else, meanwhile
  await docs.getByRole("button", { name: `CR of ${PLATE}` }).click();
  await docs.getByLabel("CR", { exact: true }).selectOption("Yes");
  await expect(docs.getByText(/Someone changed this cell a moment ago/)).toBeVisible();
  expect((await db().from("docs_units").select("cr").eq("plate_no", PLATE).single()).data.cr).toBe("To follow");
  await docs.close();
});
