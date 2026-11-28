import { describe, expect, it } from "vitest";
import { ALL_MODULE_IDS, NAV_ITEMS, effectiveModules, isActivePath, navFor, navGroups, roleModules, tabBarItems } from "@/lib/navigation";
import { editsCars, editsOut, editsPapers, editsTransfer, isAdmin, isSuper, roleFromDb, seesSales } from "@/lib/roles";
import { tabHint } from "@/app/(app)/documents/[plate]/tabs";

describe("navigation", () => {
  it("each role sees its own pages", () => {
    expect(navFor("super_admin").map((i) => i.href)).toEqual(["/home", "/dashboard", "/activity", "/new", "/deals", "/reminders", "/cars", "/new-cars", "/documents", "/documents/add", "/repairs", "/settings", "/admin/users", "/admin/sync"]);
    expect(navFor("admin").map((i) => i.href)).toEqual(["/home", "/activity", "/cars", "/new-cars", "/documents", "/documents/add", "/repairs"]); // every module, none of the administration tools; receipts, transactions and reminders are hidden for now
    expect(navFor("buying").map((i) => i.href)).toEqual(["/home", "/cars", "/documents", "/documents/add", "/repairs"]); // Add a car is in the menu for Buying
    expect(navFor("marketing").map((i) => i.href)).toEqual(["/home", "/cars", "/documents", "/repairs"]); // the same pages, looking only
    expect(navFor("sales").map((i) => i.href)).toEqual(["/home", "/cars", "/documents", "/repairs"]);
  });

  it("new receipt, transactions and reminders are for the Super Admin only, the dashboard too (it is given to a person on the Users page)", () => {
    for (const id of ["new", "deals", "reminders"]) expect(NAV_ITEMS.find((i) => i.id === id)?.roles).toEqual(["super_admin"]);
    expect(NAV_ITEMS.find((i) => i.id === "dashboard")?.roles).toEqual(["super_admin"]);
  });

  it("settings, users and sync jobs are for the Super Admin only", () => {
    for (const item of NAV_ITEMS.filter((i) => ["/settings", "/admin/users", "/admin/sync"].includes(i.href))) expect(item.roles).toEqual(["super_admin"]);
  });

  it("groups the sidebar into Overview, Receipts, Cars and Administration (only the Super Admin has Receipts)", () => {
    expect(navGroups("super_admin").map((g) => [g.label, g.items.length])).toEqual([["Overview", 3], ["Receipts", 3], ["Cars", 5], ["Administration", 3]]);
    expect(navGroups("admin").map((g) => g.label)).toEqual(["Overview", "Cars"]);
    expect(navGroups("sales").map((g) => g.label)).toEqual(["Overview", "Cars"]); // Home is first for everyone
    expect(navGroups("marketing").map((g) => g.label)).toEqual(["Overview", "Cars"]);
  });

  it("the phone tab bar shows four items and puts the rest in More", () => {
    expect(tabBarItems("marketing")).toMatchObject({ more: [] });
    expect(tabBarItems("sales").tabs.map((i) => i.label)).toEqual(["Home", "Car Inventory", "Car documents", "Repairs"]);
    const admin = tabBarItems("super_admin");
    expect(admin.tabs.map((i) => i.label)).toEqual(["Home", "Dashboard", "Activity log", "New receipt"]);
    expect(admin.more.map((i) => i.label)).toEqual(["Transactions", "Reminders", "Car Inventory", "New cars to price", "Car documents", "Add a car", "Repairs", "Settings", "Users", "Sync jobs"]);
  });

  it("marks the current page", () => {
    expect(isActivePath("/deals", "/deals")).toBe(true);
    expect(isActivePath("/deals", "/deals/abc")).toBe(true);
    expect(isActivePath("/deals", "/dealsheet")).toBe(false);
    expect(isActivePath("/admin/users", "/admin/sync")).toBe(false);
    expect(isActivePath("/deals", null)).toBe(false);
    // Add a car is lit on its own page, and Car documents is not lit with it
    expect(isActivePath("/documents/add", "/documents/add")).toBe(true);
    expect(isActivePath("/documents", "/documents/add")).toBe(false);
    expect(isActivePath("/documents", "/documents/ABC1234")).toBe(true);
  });

  it("Add a car follows the Car documents module: it cannot be given or hidden on its own", () => {
    expect(ALL_MODULE_IDS).not.toContain("add");
    expect(roleModules("buying")).not.toContain("add");
    expect(navFor("sales", effectiveModules("sales", ["documents"])).map((i) => i.href)).toContain("/documents/add");
    expect(navFor("buying", effectiveModules("buying", [], ["documents"])).map((i) => i.href)).not.toContain("/documents/add");
  });

  it("a person's modules are the role's, plus granted ones, minus hidden ones", () => {
    expect(effectiveModules("sales")).toEqual(roleModules("sales"));
    // extra access
    expect(effectiveModules("sales", ["dashboard", "documents"])).toEqual(expect.arrayContaining(["dashboard", "documents", "cars"]));
    // any module can be given, including the powerful ones (the Users page asks to type GRANT for those)
    expect(effectiveModules("sales", ["settings", "users", "sync", "activity"])).toEqual(expect.arrayContaining(["settings", "users", "sync", "activity", "cars"]));
    expect(effectiveModules("marketing", ["deals"])).toContain("deals");
    // hiding works on any module and wins over a grant
    expect(effectiveModules("sales", [], ["reminders"])).not.toContain("reminders");
    expect(effectiveModules("sales", ["dashboard"], ["dashboard"])).not.toContain("dashboard");
    // a Super Admin always keeps Users and Settings
    expect(effectiveModules("super_admin", [], ["users", "settings", "sync"])).toEqual(expect.arrayContaining(["users", "settings"]));
    expect(effectiveModules("super_admin", [], ["users", "settings", "sync"])).not.toEqual(expect.arrayContaining(["sync"]));
    // junk is ignored
    expect(effectiveModules("sales", ["nonsense"], ["alsoNonsense"])).toEqual(roleModules("sales"));
  });

  it("the menu follows the modules a person has", () => {
    const mods = effectiveModules("sales", ["dashboard"], ["reminders"]);
    expect(navFor("sales", mods).map((i) => i.href)).toEqual(["/home", "/dashboard", "/cars", "/documents", "/repairs"]);
  });
});

describe("what each role may do", () => {
  it("Super Admin and Admin oversee; only the Super Admin runs the administration tools", () => {
    expect([isSuper("super_admin"), isSuper("admin")]).toEqual([true, false]);
    for (const r of ["super_admin", "admin"] as const) expect([isAdmin(r), editsPapers(r), editsOut(r), editsCars(r), seesSales(r)]).toEqual([true, true, true, true, true]);
  });
  it("Buying handles the IN documents, Sales and Online Marketing add the OUT documents, Documentation does every tab", () => {
    expect([editsPapers("buying"), editsOut("buying"), editsTransfer("buying"), editsCars("buying"), seesSales("buying"), isAdmin("buying")]).toEqual([true, false, false, false, true, false]);
    expect([editsPapers("documentation"), editsOut("documentation"), editsTransfer("documentation"), editsCars("documentation"), seesSales("documentation"), isAdmin("documentation")]).toEqual([true, true, true, false, true, false]);
    expect([editsPapers("sales"), editsOut("sales"), editsCars("sales"), seesSales("sales"), isAdmin("sales")]).toEqual([false, true, true, true, false]);
    expect([editsPapers("marketing"), editsOut("marketing"), editsTransfer("marketing"), editsCars("marketing"), seesSales("marketing"), isAdmin("marketing")]).toEqual([false, true, false, false, false, false]);
    expect([editsTransfer("sales"), editsTransfer("admin"), editsTransfer("super_admin")]).toEqual([false, true, true]);
  });
  it("the modules behind the tabs: IN for Buying and Documentation, OUT for Sales, Online Marketing and Documentation, Sale and transfer for Documentation", () => {
    const has = (r: Parameters<typeof roleModules>[0], m: string) => (roleModules(r) as string[]).includes(m);
    expect(["buying", "documentation", "sales", "marketing"].map((r) => has(r as never, "documents"))).toEqual([true, true, false, false]);
    expect(["buying", "documentation", "sales", "marketing"].map((r) => has(r as never, "upload"))).toEqual([false, true, true, true]);
    expect(["buying", "documentation", "sales", "marketing", "admin"].map((r) => has(r as never, "transfer"))).toEqual([false, true, false, false, true]);
  });
  it("every tab says in a line what it is and what this person does there", () => {
    const buying = { editsIn: true, editsOut: false, seesSales: true }, sales = { editsIn: false, editsOut: true, seesSales: true }, marketing = { editsIn: false, editsOut: true, seesSales: false };
    expect(tabHint("documents", buying)).toMatch(/upload photos/);
    expect(tabHint("documents", sales)).toMatch(/for you to read/);
    expect(tabHint("payments", sales)).toMatch(/upload the three papers/);
    expect(tabHint("overview", marketing)).toMatch(/add the OUT documents/);
    expect(tabHint("sale", { ...sales, editsTransfer: true })).toMatch(/hand them to Sir Jep/);
    expect(tabHint("sale", sales)).toMatch(/Documentation does the transfer/);
    for (const t of ["overview", "documents", "payments", "sale", "receipts", "details"] as const) for (const w of [buying, sales, marketing]) expect(tabHint(t, w).length).toBeGreaterThan(20);
  });
  it("what the database held before the roles still reads correctly", () => {
    expect(roleFromDb("approver")).toBe("admin");
    expect(roleFromDb("documentation")).toBe("documentation");
    expect(roleFromDb("super_admin")).toBe("super_admin");
    expect(roleFromDb("nonsense")).toBe("sales");
    expect(roleFromDb(undefined)).toBe("sales");
  });
});
