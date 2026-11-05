import { describe, expect, it } from "vitest";
import { NAV_ITEMS, isActivePath, navFor, navGroups, tabBarItems } from "@/lib/navigation";

describe("navigation", () => {
  it("each role sees its own pages", () => {
    expect(navFor("sales").map((i) => i.href)).toEqual(["/new", "/deals", "/reminders", "/upload-documents"]);
    expect(navFor("documentation").map((i) => i.href)).toEqual(["/deals", "/documents"]); // no receipts, no money pages
    expect(navFor("approver").map((i) => i.href)).toEqual(["/new", "/deals", "/approvals", "/reminders", "/upload-documents", "/cash", "/activity"]);
    expect(navFor("admin").map((i) => i.href)).toEqual(["/new", "/deals", "/approvals", "/reminders", "/documents", "/upload-documents", "/cash", "/activity", "/settings", "/admin/users", "/admin/sync"]);
  });

  it("settings, users and sync jobs are for the Admin only", () => {
    for (const item of NAV_ITEMS.filter((i) => ["/settings", "/admin/users", "/admin/sync"].includes(i.href))) expect(item.roles).toEqual(["admin"]);
  });

  it("groups the sidebar into Operations and Administration (Sales have no Administration)", () => {
    expect(navGroups("admin").map((g) => [g.label, g.items.length])).toEqual([["Operations", 8], ["Administration", 3]]);
    expect(navGroups("sales").map((g) => g.label)).toEqual(["Operations"]);
  });

  it("the phone tab bar shows four items and puts the rest in More", () => {
    expect(tabBarItems("sales")).toMatchObject({ more: [] });
    expect(tabBarItems("documentation")).toMatchObject({ more: [] });
    const admin = tabBarItems("admin");
    expect(admin.tabs.map((i) => i.label)).toEqual(["New receipt", "Transactions", "Approvals", "Reminders"]);
    expect(admin.more.map((i) => i.label)).toEqual(["Car documents", "Upload documents", "Daily cash report", "Activity log", "Settings", "Users", "Sync jobs"]);
  });

  it("marks the current page", () => {
    expect(isActivePath("/deals", "/deals")).toBe(true);
    expect(isActivePath("/deals", "/deals/abc")).toBe(true);
    expect(isActivePath("/deals", "/dealsheet")).toBe(false);
    expect(isActivePath("/admin/users", "/admin/sync")).toBe(false);
    expect(isActivePath("/deals", null)).toBe(false);
  });
});
