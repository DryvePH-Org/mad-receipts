import {
  Bell,
  Car,
  Coins,
  FolderCheck,
  History,
  LayoutDashboard,
  Receipt,
  RefreshCw,
  Settings,
  ShieldCheck,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";

export type Role = "sales" | "admin" | "approver" | "documentation";

export type ModuleId = "dashboard" | "new" | "deals" | "approvals" | "reminders" | "documents" | "upload" | "cash" | "activity" | "settings" | "users" | "sync";

export interface NavItem {
  id: ModuleId;
  href: string;
  label: string;
  icon: LucideIcon;
  group: "Operations" | "Administration";
  roles: Role[];
  /** Which live count (if any) is shown beside the item. */
  badge?: "approvals" | "reminders";
}

const ALL: Role[] = ["sales", "admin", "approver", "documentation"];
const MONEY: Role[] = ["sales", "admin", "approver"];

// Menus are data, not markup: the sidebar, the phone tab bar and its "More" sheet all read this.
export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Operations", roles: ["admin", "approver"] },
  { id: "new", href: "/new", label: "New receipt", icon: Receipt, group: "Operations", roles: MONEY },
  { id: "deals", href: "/deals", label: "Transactions", icon: Car, group: "Operations", roles: ALL },
  { id: "approvals", href: "/approvals", label: "Approvals", icon: ShieldCheck, group: "Operations", roles: ["admin", "approver"], badge: "approvals" },
  { id: "reminders", href: "/reminders", label: "Reminders", icon: Bell, group: "Operations", roles: MONEY, badge: "reminders" },
  { id: "documents", href: "/documents", label: "Car documents", icon: FolderCheck, group: "Operations", roles: ["admin", "documentation"] },
  { id: "upload", href: "/upload-documents", label: "Upload documents", icon: Upload, group: "Operations", roles: ["sales", "admin", "approver"] },
  { id: "cash", href: "/cash", label: "Daily cash report", icon: Coins, group: "Operations", roles: ["admin", "approver"] },
  { id: "activity", href: "/activity", label: "Activity log", icon: History, group: "Operations", roles: ["admin", "approver"] },
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

/** What a role includes with no changes. */
export const roleModules = (role: Role): ModuleId[] => NAV_ITEMS.filter((i) => i.roles.includes(role)).map((i) => i.id);

/** The modules a person has: their role's, plus what the Admin granted (only grantable ones), minus what was hidden. Hiding wins. */
export function effectiveModules(role: Role, grants: readonly string[] = [], denies: readonly string[] = []): ModuleId[] {
  const set = new Set<ModuleId>(roleModules(role));
  for (const g of grants) if (isModuleId(g) && GRANTABLE.includes(g)) set.add(g);
  for (const d of denies) if (isModuleId(d) && !(role === "admin" && ADMIN_FLOOR.includes(d))) set.delete(d);
  return NAV_ITEMS.map((i) => i.id).filter((id) => set.has(id));
}

export const ROLE_LABELS: Record<Role, string> = { sales: "Sales", admin: "Admin", approver: "Approver", documentation: "Documentation" };

/** The menu items this role may see. (The pages and the database enforce access too.) */
export const navFor = (role: Role, modules: readonly ModuleId[] = roleModules(role)): NavItem[] => NAV_ITEMS.filter((item) => modules.includes(item.id));

/** The nav groups for the sidebar, in order, each with its items. */
export function navGroups(role: Role, modules?: readonly ModuleId[]): { label: NavItem["group"]; items: NavItem[] }[] {
  const items = navFor(role, modules);
  return (["Operations", "Administration"] as const)
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
  return pathname === href || pathname.startsWith(`${href}/`);
}
