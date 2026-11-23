import { describe, expect, it } from "vitest";
import { canAssignRole, canManageUser } from "@/lib/user-rules";

describe("someone with the Users module who is not a Super Admin", () => {
  it("can look after ordinary accounts", () => {
    expect(canManageUser("sales", "sales")).toBe(true);
    expect(canAssignRole("admin", "buying")).toBe(true);
    expect(canAssignRole("admin", "marketing")).toBe(true);
  });
  it("cannot make an Admin or a Super Admin, or touch one (that would be a way to become one)", () => {
    expect(canAssignRole("sales", "admin")).toBe(false);
    expect(canAssignRole("admin", "super_admin")).toBe(false);
    expect(canManageUser("sales", "admin")).toBe(false);
    expect(canManageUser("admin", "super_admin")).toBe(false);
    expect(canManageUser("admin", "admin")).toBe(false);
  });
  it("a Super Admin can do all of it", () => {
    expect(canAssignRole("super_admin", "admin")).toBe(true);
    expect(canAssignRole("super_admin", "super_admin")).toBe(true);
    expect(canManageUser("super_admin", "admin")).toBe(true);
  });
});
