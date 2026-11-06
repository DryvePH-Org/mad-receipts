export type Role = "admin" | "custodian" | "approver" | "accounting";

export const ALL_ROLES: readonly Role[] = [
  "admin",
  "custodian",
  "approver",
  "accounting",
];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  custodian: "Custodian",
  approver: "Approver",
  accounting: "Accounting",
};

// The petty cash home (/pcf) matches only itself, so an unknown /pcf/... page is never allowed by it.
const ROUTE_RULES: readonly { prefix: string; roles: readonly Role[]; exact?: boolean }[] = [
  { prefix: "/pcf/funds", roles: ["admin"] },
  { prefix: "/pcf/categories", roles: ["admin"] },
  { prefix: "/pcf/notifications", roles: ["admin"] },
  { prefix: "/pcf/vouchers/new", roles: ["admin", "custodian", "approver"] },
  { prefix: "/pcf/vouchers", roles: ALL_ROLES },
  { prefix: "/pcf/approvals", roles: ["admin", "approver"] },
  { prefix: "/pcf/replenishments", roles: ["admin", "custodian", "accounting"] },
  { prefix: "/pcf/cash-count", roles: ["admin", "custodian"] },
  { prefix: "/pcf/reports", roles: ["admin", "accounting"] },
  { prefix: "/pcf/audit", roles: ["admin", "accounting"] },
  { prefix: "/pcf", roles: ALL_ROLES, exact: true },
];

export function canAccessRoute(role: Role, pathname: string): boolean {
  const rule = ROUTE_RULES.find(
    (candidate) =>
      pathname === candidate.prefix ||
      (!candidate.exact && pathname.startsWith(`${candidate.prefix}/`)),
  );
  return rule ? rule.roles.includes(role) : false;
}

export type Action =
  | "voucher.create"
  | "voucher.submit"
  | "voucher.approve"
  | "voucher.reject"
  | "voucher.release"
  | "voucher.void"
  | "replenishment.create"
  | "replenishment.submit"
  | "replenishment.review"
  | "replenishment.close"
  | "cash.count"
  | "admin.manage";

export const ACTION_ROLES: Record<Action, readonly Role[]> = {
  "voucher.create": ["custodian", "approver", "admin"],
  "voucher.submit": ["custodian", "approver", "admin"],
  "voucher.approve": ["approver", "admin"],
  "voucher.reject": ["approver", "admin"],
  "voucher.release": ["custodian", "approver", "admin"],
  "voucher.void": ["custodian", "approver", "admin"],
  "replenishment.create": ["custodian", "admin"],
  "replenishment.submit": ["custodian", "admin"],
  "replenishment.review": ["accounting", "admin"],
  "replenishment.close": ["accounting", "admin"],
  "cash.count": ["custodian", "admin"],
  "admin.manage": ["admin"],
};

export function canPerform(role: Role, action: Action): boolean {
  return ACTION_ROLES[action].includes(role);
}
