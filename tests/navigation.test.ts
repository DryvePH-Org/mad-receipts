import { describe, expect, it } from "vitest";
import { NAV_ITEMS, effectiveModules, isActivePath, navFor, navGroups, roleModules, tabBarItems } from "@/lib/navigation";

describe("navigation", () => {
  it("each role sees its own pages", () => {
    expect(navFor("sales").map((i) => i.href)).toEqual(["/new", "/deals", "/reminders", "/upload-documents"]);
    expect(navFor("documentation").map((i) => i.href)).toEqual(["/deals", "/documents"]); // no receipts, no money pages
    expect(navFor("approver").map((i) => i.href)).toEqual(["/dashboard", "/new", "/deals", "/approvals", "/reminders", "/upload-documents", "/cash", "/activity"]);
    expect(navFor("admin").map((i) => i.href)).toEqual(["/dashboard", "/new", "/deals", "/approvals", "/reminders", "/documents", "/upload-documents", "/cash", "/activity", "/settings", "/admin/users", "/admin/sync"]);
  });

  it("settings, users and sync jobs are for the Admin only", () => {
    for (const item of NAV_ITEMS.filter((i) => ["/settings", "/admin/users", "/admin/sync"].includes(i.href))) expect(item.roles).toEqual(["admin"]);
  });

  it("groups the sidebar into Operations and Administration (Sales have no Administration)", () => {
    expect(navGroups("admin").map((g) => [g.label, g.items.length])).toEqual([["Operations", 9], ["Administration", 3]]);
    expect(navGroups("sales").map((g) => g.label)).toEqual(["Operations"]);
  });

  it("the phone tab bar shows four items and puts the rest in More", () => {
    expect(tabBarItems("sales")).toMatchObject({ more: [] });
    expect(tabBarItems("documentation")).toMatchObject({ more: [] });
    const admin = tabBarItems("admin");
    expect(admin.tabs.map((i) => i.label)).toEqual(["Dashboard", "New receipt", "Transactions", "Approvals"]);
    expect(admin.more.map((i) => i.label)).toEqual(["Reminders", "Car documents", "Upload documents", "Daily cash report", "Activity log", "Settings", "Users", "Sync jobs"]);
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
    // extra access, but only for modules that do not depend on the role's database rights
    expect(effectiveModules("sales", ["dashboard", "documents"])).toEqual(expect.arrayContaining(["dashboard", "documents", "new"]));
    expect(effectiveModules("sales", ["approvals", "cash", "settings", "users", "sync", "activity"])).toEqual(roleModules("sales"));
    expect(effectiveModules("documentation", ["upload"])).toContain("upload");
    // hiding works on any module and wins over a grant
    expect(effectiveModules("sales", [], ["reminders"])).not.toContain("reminders");
    expect(effectiveModules("sales", ["dashboard"], ["dashboard"])).not.toContain("dashboard");
    // an Admin always keeps Users and Settings
    expect(effectiveModules("admin", [], ["users", "settings", "sync", "cash"])).toEqual(expect.arrayContaining(["users", "settings"]));
    expect(effectiveModules("admin", [], ["users", "settings", "sync", "cash"])).not.toEqual(expect.arrayContaining(["sync"]));
    // junk is ignored
    expect(effectiveModules("sales", ["nonsense"], ["alsoNonsense"])).toEqual(roleModules("sales"));
  });

  it("the menu follows the modules a person has", () => {
    const mods = effectiveModules("sales", ["dashboard"], ["reminders"]);
    expect(navFor("sales", mods).map((i) => i.href)).toEqual(["/dashboard", "/new", "/deals", "/upload-documents"]);
    expect(tabBarItems("sales", mods).tabs.map((i) => i.label)).toEqual(["Dashboard", "New receipt", "Transactions", "Upload documents"]);
  });
});
