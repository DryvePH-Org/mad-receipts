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

export interface NavItem {
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
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Operations", roles: ["admin", "approver"] },
  { href: "/new", label: "New receipt", icon: Receipt, group: "Operations", roles: MONEY },
  { href: "/deals", label: "Transactions", icon: Car, group: "Operations", roles: ALL },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck, group: "Operations", roles: ["admin", "approver"], badge: "approvals" },
  { href: "/reminders", label: "Reminders", icon: Bell, group: "Operations", roles: MONEY, badge: "reminders" },
  { href: "/documents", label: "Car documents", icon: FolderCheck, group: "Operations", roles: ["admin", "documentation"] },
  { href: "/upload-documents", label: "Upload documents", icon: Upload, group: "Operations", roles: ["sales", "admin", "approver"] },
  { href: "/cash", label: "Daily cash report", icon: Coins, group: "Operations", roles: ["admin", "approver"] },
  { href: "/activity", label: "Activity log", icon: History, group: "Operations", roles: ["admin", "approver"] },
  { href: "/settings", label: "Settings", icon: Settings, group: "Administration", roles: ["admin"] },
  { href: "/admin/users", label: "Users", icon: Users, group: "Administration", roles: ["admin"] },
  { href: "/admin/sync", label: "Sync jobs", icon: RefreshCw, group: "Administration", roles: ["admin"] },
];

export const ROLE_LABELS: Record<Role, string> = { sales: "Sales", admin: "Admin", approver: "Approver", documentation: "Documentation" };

/** The menu items this role may see. (The pages and the database enforce access too.) */
export const navFor = (role: Role): NavItem[] => NAV_ITEMS.filter((item) => item.roles.includes(role));

/** The nav groups for the sidebar, in order, each with its items. */
export function navGroups(role: Role): { label: NavItem["group"]; items: NavItem[] }[] {
  const items = navFor(role);
  return (["Operations", "Administration"] as const)
    .map((label) => ({ label, items: items.filter((i) => i.group === label) }))
    .filter((group) => group.items.length > 0);
}

/** Phone tab bar: the first four items; anything beyond goes in the "More" sheet. */
export function tabBarItems(role: Role): { tabs: NavItem[]; more: NavItem[] } {
  const items = navFor(role);
  return { tabs: items.slice(0, 4), more: items.slice(4) };
}

/** Whether a menu item is the current page. */
export function isActivePath(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
