import {
  BarChart3,
  Bell,
  Calculator,
  Car,
  ClipboardCheck,
  Coins,
  FolderCheck,
  History,
  Landmark,
  LayoutDashboard,
  Mail,
  Receipt,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Settings,
  ShieldCheck,
  Tags,
  Upload,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type Role = "sales" | "admin" | "approver" | "documentation";
/** The PCF (petty cash) role, separate from the Invoice role above. Null means no PCF at all. */
export type PcfRole = "admin" | "custodian" | "approver" | "accounting";

export type ModuleId =
  | "dashboard" | "new" | "deals" | "approvals" | "reminders" | "documents" | "upload" | "cash" | "activity" | "settings" | "users" | "sync"
  | "pcf" | "pcf-vouchers" | "pcf-approvals" | "pcf-replenishments" | "pcf-cash-count" | "pcf-reports" | "pcf-audit" | "pcf-funds" | "pcf-categories" | "pcf-notifications";

export interface NavItem {
  id: ModuleId;
  href: string;
  label: string;
  icon: LucideIcon;
  group: "Invoice" | "PCF" | "Administration";
  roles: Role[];
  /** PCF modules come with the PCF role instead of the role above. */
  pcfRoles?: PcfRole[];
  /** Which live count (if any) is shown beside the item. */
  badge?: "approvals" | "reminders";
}

const ALL: Role[] = ["sales", "admin", "approver", "documentation"];
const MONEY: Role[] = ["sales", "admin", "approver"];
const PCF_ALL: PcfRole[] = ["admin", "custodian", "approver", "accounting"];

// Menus are data, not markup: the sidebar, the phone tab bar and its "More" sheet all read this.
export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Invoice", roles: ["admin", "approver"] },
  { id: "new", href: "/new", label: "New receipt", icon: Receipt, group: "Invoice", roles: MONEY },
  { id: "deals", href: "/deals", label: "Transactions", icon: Car, group: "Invoice", roles: ALL },
  { id: "approvals", href: "/approvals", label: "Approvals", icon: ShieldCheck, group: "Invoice", roles: ["admin", "approver"], badge: "approvals" },
  { id: "reminders", href: "/reminders", label: "Reminders", icon: Bell, group: "Invoice", roles: MONEY, badge: "reminders" },
  { id: "documents", href: "/documents", label: "Car documents", icon: FolderCheck, group: "Invoice", roles: ["admin", "documentation"] },
  { id: "upload", href: "/upload-documents", label: "Upload documents", icon: Upload, group: "Invoice", roles: ["sales", "admin", "approver"] },
  { id: "cash", href: "/cash", label: "Daily cash report", icon: Coins, group: "Invoice", roles: ["admin", "approver"] },
  { id: "activity", href: "/activity", label: "Activity log", icon: History, group: "Invoice", roles: ["admin", "approver"] },
  { id: "pcf", href: "/pcf", label: "PCF overview", icon: Wallet, group: "PCF", roles: [], pcfRoles: PCF_ALL },
  { id: "pcf-vouchers", href: "/pcf/vouchers", label: "Vouchers", icon: ReceiptText, group: "PCF", roles: [], pcfRoles: PCF_ALL },
  { id: "pcf-approvals", href: "/pcf/approvals", label: "Voucher approvals", icon: ClipboardCheck, group: "PCF", roles: [], pcfRoles: ["admin", "approver"] },
  { id: "pcf-replenishments", href: "/pcf/replenishments", label: "Replenishments", icon: RotateCcw, group: "PCF", roles: [], pcfRoles: ["admin", "custodian", "accounting"] },
  { id: "pcf-cash-count", href: "/pcf/cash-count", label: "Cash count", icon: Calculator, group: "PCF", roles: [], pcfRoles: ["admin", "custodian"] },
  { id: "pcf-reports", href: "/pcf/reports", label: "PCF reports", icon: BarChart3, group: "PCF", roles: [], pcfRoles: ["admin", "accounting"] },
  { id: "pcf-audit", href: "/pcf/audit", label: "Audit trail", icon: ScrollText, group: "PCF", roles: [], pcfRoles: ["admin", "accounting"] },
  { id: "pcf-funds", href: "/pcf/funds", label: "Funds", icon: Landmark, group: "PCF", roles: [], pcfRoles: ["admin"] },
  { id: "pcf-categories", href: "/pcf/categories", label: "Categories", icon: Tags, group: "PCF", roles: [], pcfRoles: ["admin"] },
  { id: "pcf-notifications", href: "/pcf/notifications", label: "Email log", icon: Mail, group: "PCF", roles: [], pcfRoles: ["admin"] },
  { id: "settings", href: "/settings", label: "Settings", icon: Settings, group: "Administration", roles: ["admin"] },
  { id: "users", href: "/admin/users", label: "Users", icon: Users, group: "Administration", roles: ["admin"] },
  { id: "sync", href: "/admin/sync", label: "Sync jobs", icon: RefreshCw, group: "Administration", roles: ["admin"] },
];

/**
 * Modules that can be given to someone whose role does not include them. Only the ones that do not depend on the role's
 * rights in the database: the others (approving, the cash report, the activity log, settings, users, sync) would open
 * empty or fail, and they are the powerful ones, so they stay with the role. Any module can be hidden from a person.
 */
export const GRANTABLE: ModuleId[] = ["dashboard", "documents", "upload", "reminders"];
/** An Admin can never lose these two, so someone always stays in charge. */
export const ADMIN_FLOOR: ModuleId[] = ["users", "settings"];

export const ALL_MODULE_IDS = NAV_ITEMS.map((i) => i.id);
export const isModuleId = (v: unknown): v is ModuleId => typeof v === "string" && (ALL_MODULE_IDS as string[]).includes(v);

/** What a role (and PCF role, if any) includes with no changes. */
export const roleModules = (role: Role, pcfRole: PcfRole | null = null): ModuleId[] =>
  NAV_ITEMS.filter((i) => i.roles.includes(role) || (pcfRole !== null && !!i.pcfRoles?.includes(pcfRole))).map((i) => i.id);

/** The PCF role that counts: the one set, or admin for an Admin without one; none while switched off. Matches app_role() in the database. */
export function effectivePcfRole(role: Role, pcfRole: string | null | undefined, active = true): PcfRole | null {
  if (!active) return null;
  if (pcfRole === "admin" || pcfRole === "custodian" || pcfRole === "approver" || pcfRole === "accounting") return pcfRole;
  return role === "admin" ? "admin" : null;
}

/** The modules a person has: their role's, plus what the Admin granted (only grantable ones), minus what was hidden. Hiding wins. */
export function effectiveModules(role: Role, grants: readonly string[] = [], denies: readonly string[] = [], pcfRole: PcfRole | null = null): ModuleId[] {
  const set = new Set<ModuleId>(roleModules(role, pcfRole));
  for (const g of grants) if (isModuleId(g) && GRANTABLE.includes(g)) set.add(g);
  for (const d of denies) if (isModuleId(d) && !(role === "admin" && ADMIN_FLOOR.includes(d))) set.delete(d);
  return NAV_ITEMS.map((i) => i.id).filter((id) => set.has(id));
}

export const ROLE_LABELS: Record<Role, string> = { sales: "Sales", admin: "Admin", approver: "Approver", documentation: "Documentation" };
export const PCF_ROLE_LABELS: Record<PcfRole, string> = { admin: "Admin", custodian: "Custodian", approver: "Approver", accounting: "Accounting" };

/** The menu items this role may see. (The pages and the database enforce access too.) */
export const navFor = (role: Role, modules: readonly ModuleId[] = roleModules(role)): NavItem[] => NAV_ITEMS.filter((item) => modules.includes(item.id));

/** The nav groups for the sidebar, in order, each with its items. */
export function navGroups(role: Role, modules?: readonly ModuleId[]): { label: NavItem["group"]; items: NavItem[] }[] {
  const items = navFor(role, modules);
  return (["Invoice", "PCF", "Administration"] as const)
    .map((label) => ({ label, items: items.filter((i) => i.group === label) }))
    .filter((group) => group.items.length > 0);
}

/** Phone tab bar: the first four items; anything beyond goes in the "More" sheet. */
export function tabBarItems(role: Role, modules?: readonly ModuleId[]): { tabs: NavItem[]; more: NavItem[] } {
  const items = navFor(role, modules);
  return { tabs: items.slice(0, 4), more: items.slice(4) };
}

/** Whether a menu item is the current page. */
export function isActivePath(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  const matches = (h: string) => pathname === h || pathname.startsWith(`${h}/`);
  if (!matches(href)) return false;
  // A section's home (like /pcf) is not the current page when a page under it has its own menu item (like /pcf/vouchers).
  return !NAV_ITEMS.some((i) => i.href.startsWith(`${href}/`) && matches(i.href));
}
