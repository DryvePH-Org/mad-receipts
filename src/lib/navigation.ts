import {
  Camera,
  Car,
  Contact,
  LayoutDashboard,
  Receipt,
  RefreshCw,
  ScrollText,
  Users,
  type LucideIcon,
} from "lucide-react";

export type Role = "staff" | "admin";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: "Operations" | "Administration";
  roles: Role[];
}

// Menus are data, not markup: the sidebar, the phone tab bar and its "More" sheet all read this.
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, group: "Operations", roles: ["staff", "admin"] },
  { href: "/upload", label: "Upload", icon: Camera, group: "Operations", roles: ["staff", "admin"] },
  { href: "/deals", label: "Deals", icon: Car, group: "Operations", roles: ["staff", "admin"] },
  { href: "/receipts", label: "Receipts", icon: Receipt, group: "Operations", roles: ["staff", "admin"] },
  { href: "/admin/users", label: "Users", icon: Users, group: "Administration", roles: ["admin"] },
  { href: "/admin/salespeople", label: "Salespeople", icon: Contact, group: "Administration", roles: ["admin"] },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText, group: "Administration", roles: ["admin"] },
  { href: "/admin/sync", label: "Sync jobs", icon: RefreshCw, group: "Administration", roles: ["admin"] },
];

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

/** Whether a menu item is the current page ("/" matches only itself). */
export function isActivePath(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
