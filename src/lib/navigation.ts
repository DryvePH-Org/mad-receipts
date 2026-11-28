import {
  Bell,
  CirclePlus,
  BookOpenCheck,
  Car,
  Tag,
  CarFront,
  FolderCheck,
  History,
  House,
  LayoutDashboard,
  Receipt,
  Wrench,
  RefreshCw,
  Settings,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "@/lib/roles";
export { ROLE_LABELS, type Role } from "@/lib/roles";

export type ModuleId = "home" | "dashboard" | "cars" | "register" | "new" | "deals" | "reminders" | "documents" | "repairs" | "upload" | "activity" | "settings" | "users" | "sync" | "add" | "pricing" | "transfer";

export interface NavItem {
  id: ModuleId;
  href: string;
  label: string;
  icon: LucideIcon;
  group: "Overview" | "Receipts" | "Cars" | "Administration";
  roles: Role[];
  /** false: the module exists (it can be given or hidden, and its pages check it) but has no menu entry of its own */
  menu?: false;
  /** Which live count (if any) is shown beside the item. */
  badge?: "reminders" | "pricing";
  /** where the link goes when that is not the item's own address (the Dashboard opens straight on Buy, with no redirect in between) */
  to?: string;
  /** a menu entry that is not a module of its own: it is shown to whoever has this other module (so it cannot be given or hidden alone) */
  via?: ModuleId;
}

const ALL: Role[] = ["super_admin", "admin", "buying", "documentation", "marketing", "sales"];
const ADMINS: Role[] = ["super_admin", "admin"];
const SUPER: Role[] = ["super_admin"];

// Menus are data, not markup: the sidebar, the phone tab bar and its "More" sheet all read this.
export const NAV_ITEMS: NavItem[] = [
  { id: "home", href: "/home", label: "Home", icon: House, group: "Overview", roles: ALL }, // each person's own home: what they are working on and what needs them
  { id: "dashboard", href: "/dashboard", to: "/dashboard/buy", label: "Dashboard", icon: LayoutDashboard, group: "Overview", roles: SUPER },
  { id: "activity", href: "/activity", label: "Activity log", icon: History, group: "Overview", roles: ADMINS },
  { id: "new", href: "/new", label: "New receipt", icon: Receipt, group: "Receipts", roles: SUPER },
  { id: "deals", href: "/deals", label: "Transactions", icon: Car, group: "Receipts", roles: SUPER },
  { id: "reminders", href: "/reminders", label: "Reminders", icon: Bell, group: "Receipts", roles: SUPER, badge: "reminders" },
  { id: "cars", href: "/cars", label: "Car Inventory", icon: CarFront, group: "Cars", roles: ALL },
  { id: "pricing", href: "/new-cars", label: "New cars to price", icon: Tag, group: "Cars", roles: ADMINS, badge: "pricing" }, // a new car waits here until an Admin sets its price; then it goes into Car Inventory
  { id: "documents", href: "/documents", label: "Car documents (act)", icon: FolderCheck, group: "Cars", roles: ["super_admin", "admin", "buying", "documentation"], menu: false }, // the IN documents: scan, check, approve: the menu entry is "register" below
  { id: "register", href: "/documents", label: "Car documents", icon: BookOpenCheck, group: "Cars", roles: ALL },
  { id: "add", href: "/documents/add", label: "Add a car", icon: CirclePlus, group: "Cars", roles: [], via: "documents" }, // Buying and the Admins: the way in to add a car and its IN documents
  { id: "repairs", href: "/repairs", label: "Repairs", icon: Wrench, group: "Cars", roles: ALL },
  { id: "upload", href: "/upload-documents", label: "Sold papers (add)", icon: Upload, group: "Cars", roles: ["super_admin", "admin", "documentation", "sales", "marketing"], menu: false }, // the OUT documents: the module that lets someone add the sold papers on a car page of Car documents
  { id: "transfer", href: "/documents/transfers", label: "Sale and transfer (act)", icon: FolderCheck, group: "Cars", roles: ["super_admin", "admin", "documentation"], menu: false }, // hand the originals to Sir Jep, take them back, release them to the buyer
  { id: "settings", href: "/settings", label: "Settings", icon: Settings, group: "Administration", roles: SUPER },
  { id: "users", href: "/admin/users", label: "Users", icon: Users, group: "Administration", roles: SUPER },
  { id: "sync", href: "/admin/sync", label: "Sync jobs", icon: RefreshCw, group: "Administration", roles: SUPER },
];

/**
 * Every module can be given to a person whose role does not include it, or hidden from a person whose role does.
 * Three of them carry real power: Settings, Users and Sync jobs. Giving those asks for an extra typed confirmation.
 */
export const SENSITIVE: ModuleId[] = ["settings", "users", "sync"];
/** A Super Admin can never lose these two, so someone always stays in charge. */
export const ADMIN_FLOOR: ModuleId[] = ["users", "settings"];

export const ALL_MODULE_IDS = NAV_ITEMS.filter((i) => !i.via).map((i) => i.id);
export const GRANTABLE: ModuleId[] = ALL_MODULE_IDS;
export const isModuleId = (v: unknown): v is ModuleId => typeof v === "string" && (ALL_MODULE_IDS as string[]).includes(v);

/** What a role includes with no changes. */
export const roleModules = (role: Role): ModuleId[] => NAV_ITEMS.filter((i) => !i.via && i.roles.includes(role)).map((i) => i.id);

/** The modules a person has: their role's, plus what the Admin granted (only grantable ones), minus what was hidden. Hiding wins. */
export function effectiveModules(role: Role, grants: readonly string[] = [], denies: readonly string[] = []): ModuleId[] {
  const set = new Set<ModuleId>(roleModules(role));
  for (const g of grants) if (isModuleId(g) && GRANTABLE.includes(g)) set.add(g);
  for (const d of denies) if (isModuleId(d) && !(role === "super_admin" && ADMIN_FLOOR.includes(d))) set.delete(d);
  return ALL_MODULE_IDS.filter((id) => set.has(id));
}


/** The menu items this role may see. (The pages and the database enforce access too.) */
export const navFor = (role: Role, modules: readonly ModuleId[] = roleModules(role)): NavItem[] => NAV_ITEMS.filter((item) => item.menu !== false && modules.includes(item.via ?? item.id));

/** The nav groups for the sidebar, in order, each with its items. */
export function navGroups(role: Role, modules?: readonly ModuleId[]): { label: NavItem["group"]; items: NavItem[] }[] {
  const items = navFor(role, modules);
  return (["Overview", "Receipts", "Cars", "Administration"] as const)
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
  const on = (h: string) => pathname === h || pathname.startsWith(`${h}/`);
  // the longest matching menu address wins: Add a car (/documents/add) is lit on its own page, not Car documents (/documents) as well
  return on(href) && !NAV_ITEMS.some((i) => i.href !== href && i.href.length > href.length && i.href.startsWith(`${href}/`) && on(i.href));
}
