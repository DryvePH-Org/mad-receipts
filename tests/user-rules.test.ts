import { describe, expect, it } from "vitest";
import { canAssignRole, canManageUser } from "@/lib/user-rules";

describe("someone with the Users module who is not an Admin", () => {
  it("can look after ordinary accounts", () => {
    expect(canManageUser("sales", "sales")).toBe(true);
    expect(canAssignRole("approver", "documentation")).toBe(true);
  });
  it("cannot make an Admin or touch one (that would be a way to become Admin)", () => {
    expect(canAssignRole("sales", "admin")).toBe(false);
    expect(canManageUser("sales", "admin")).toBe(false);
    expect(canManageUser("approver", "admin")).toBe(false);
  });
  it("an Admin can do all of it", () => {
    expect(canAssignRole("admin", "admin")).toBe(true);
    expect(canManageUser("admin", "admin")).toBe(true);
  });
});
