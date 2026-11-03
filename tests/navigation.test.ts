import { describe, expect, it } from "vitest";
import { NAV_ITEMS, isActivePath, navFor, navGroups, tabBarItems } from "@/lib/navigation";

describe("navigation", () => {
  it("staff see the four everyday pages, admins also see the admin pages", () => {
    expect(navFor("staff").map((i) => i.href)).toEqual(["/", "/upload", "/deals", "/receipts"]);
    expect(navFor("admin").map((i) => i.href)).toEqual([
      "/", "/upload", "/deals", "/receipts", "/admin/users", "/admin/salespeople", "/admin/audit", "/admin/sync",
    ]);
  });

  it("every admin page is for admins only", () => {
    for (const item of NAV_ITEMS.filter((i) => i.href.startsWith("/admin"))) expect(item.roles).toEqual(["admin"]);
  });

  it("groups the sidebar into Operations and Administration (staff have no Administration)", () => {
    expect(navGroups("admin").map((g) => [g.label, g.items.length])).toEqual([["Operations", 4], ["Administration", 4]]);
    expect(navGroups("staff").map((g) => g.label)).toEqual(["Operations"]);
  });

  it("the phone tab bar shows four items and puts the rest in More", () => {
    expect(tabBarItems("staff")).toMatchObject({ more: [] });
    expect(tabBarItems("staff").tabs).toHaveLength(4);
    const admin = tabBarItems("admin");
    expect(admin.tabs.map((i) => i.label)).toEqual(["Dashboard", "Upload", "Deals", "Receipts"]);
    expect(admin.more.map((i) => i.label)).toEqual(["Users", "Salespeople", "Audit log", "Sync jobs"]);
  });

  it("marks the current page, and Home only on the home page", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/", "/deals")).toBe(false);
    expect(isActivePath("/deals", "/deals")).toBe(true);
    expect(isActivePath("/deals", "/deals/abc")).toBe(true);
    expect(isActivePath("/deals", "/dealsheet")).toBe(false);
    expect(isActivePath("/admin/users", "/admin/audit")).toBe(false);
    expect(isActivePath("/deals", null)).toBe(false);
  });
});
