import { describe, expect, it } from "vitest";
import { NAV_ITEMS, effectiveModules, isActivePath, navFor, navGroups, roleModules, tabBarItems } from "@/lib/navigation";
import { editsCars, editsPapers, isAdmin, isSuper, roleFromDb, seesSales } from "@/lib/roles";

describe("navigation", () => {
  it("each role sees its own pages", () => {
    expect(navFor("super_admin").map((i) => i.href)).toEqual(["/dashboard", "/activity", "/new", "/deals", "/reminders", "/cars", "/documents", "/repairs", "/settings", "/admin/users", "/admin/sync"]);
    expect(navFor("admin").map((i) => i.href)).toEqual(["/dashboard", "/activity", "/cars", "/documents", "/repairs"]); // every module, none of the administration tools; receipts, transactions and reminders are hidden for now
    expect(navFor("buying").map((i) => i.href)).toEqual(["/cars", "/documents", "/repairs"]);
    expect(navFor("marketing").map((i) => i.href)).toEqual(["/cars", "/documents", "/repairs"]); // the same pages, looking only
    expect(navFor("sales").map((i) => i.href)).toEqual(["/cars", "/documents", "/repairs"]);
  });

  it("new receipt, transactions and reminders are for the Super Admin only, the dashboard for the Admins", () => {
    for (const id of ["new", "deals", "reminders"]) expect(NAV_ITEMS.find((i) => i.id === id)?.roles).toEqual(["super_admin"]);
    expect(NAV_ITEMS.find((i) => i.id === "dashboard")?.roles).toEqual(["super_admin", "admin"]);
  });

  it("settings, users and sync jobs are for the Super Admin only", () => {
    for (const item of NAV_ITEMS.filter((i) => ["/settings", "/admin/users", "/admin/sync"].includes(i.href))) expect(item.roles).toEqual(["super_admin"]);
  });

  it("groups the sidebar into Overview, Receipts, Cars and Administration (only the Super Admin has Receipts)", () => {
    expect(navGroups("super_admin").map((g) => [g.label, g.items.length])).toEqual([["Overview", 2], ["Receipts", 3], ["Cars", 3], ["Administration", 3]]);
    expect(navGroups("admin").map((g) => g.label)).toEqual(["Overview", "Cars"]);
    expect(navGroups("sales").map((g) => g.label)).toEqual(["Cars"]);
    expect(navGroups("marketing").map((g) => g.label)).toEqual(["Cars"]);
  });

  it("the phone tab bar shows four items and puts the rest in More", () => {
    expect(tabBarItems("marketing")).toMatchObject({ more: [] });
    expect(tabBarItems("sales").tabs.map((i) => i.label)).toEqual(["Car status", "Car documents", "Repairs"]);
    const admin = tabBarItems("super_admin");
    expect(admin.tabs.map((i) => i.label)).toEqual(["Dashboard", "Activity log", "New receipt", "Transactions"]);
    expect(admin.more.map((i) => i.label)).toEqual(["Reminders", "Car status", "Car documents", "Repairs", "Settings", "Users", "Sync jobs"]);
  });

  it("marks the current page", () => {
    expect(isActivePath("/deals", "/deals")).toBe(true);
    expect(isActivePath("/deals", "/deals/abc")).toBe(true);
    expect(isActivePath("/deals", "/dealsheet")).toBe(false);
    expect(isActivePath("/admin/users", "/admin/sync")).toBe(false);
    expect(isActivePath("/deals", null)).toBe(false);
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
    expect(navFor("sales", mods).map((i) => i.href)).toEqual(["/dashboard", "/cars", "/documents", "/repairs"]);
  });
});

describe("what each role may do", () => {
  it("Super Admin and Admin oversee; only the Super Admin runs the administration tools", () => {
    expect([isSuper("super_admin"), isSuper("admin")]).toEqual([true, false]);
    for (const r of ["super_admin", "admin"] as const) expect([isAdmin(r), editsPapers(r), editsCars(r), seesSales(r)]).toEqual([true, true, true, true]);
  });
  it("Buying handles the papers, Sales also change the price list and repairs, Online Marketing only looks", () => {
    expect([editsPapers("buying"), editsCars("buying"), seesSales("buying"), isAdmin("buying")]).toEqual([true, false, true, false]);
    expect([editsPapers("sales"), editsCars("sales"), seesSales("sales"), isAdmin("sales")]).toEqual([true, true, true, false]);
    expect([editsPapers("marketing"), editsCars("marketing"), seesSales("marketing"), isAdmin("marketing")]).toEqual([false, false, false, false]);
  });
  it("what the database held before the five roles still reads correctly", () => {
    expect(roleFromDb("approver")).toBe("admin");
    expect(roleFromDb("documentation")).toBe("buying");
    expect(roleFromDb("super_admin")).toBe("super_admin");
    expect(roleFromDb("nonsense")).toBe("sales");
    expect(roleFromDb(undefined)).toBe("sales");
  });
});
