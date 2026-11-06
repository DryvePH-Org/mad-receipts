import "server-only";
import { cache } from "react";
import { forbidden, redirect } from "next/navigation";

import { getCurrentUser as getAppUser } from "@/lib/auth";
import { NAV_ITEMS, isActivePath, type ModuleId } from "@/lib/navigation";
import { canAccessRoute, type Role } from "@/lib/pcf/permissions";

// PCF (petty cash) is a section of MAD: the person signs in to MAD, and their PCF role
// (profiles.pcf_role, or admin for an Admin) decides what they can do here.
export type CurrentUser = {
  id: string;
  full_name: string;
  role: Role;
};

/** The signed-in person as petty cash sees them, or null when they have no petty cash role. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const user = await getAppUser();
  if (!user?.pcfRole) return null;
  return { id: user.id, full_name: user.fullName ?? user.email, role: user.pcfRole };
});

/** The petty cash module a page belongs to (the longest menu path that contains it). */
export function moduleForPath(pathname: string): ModuleId | null {
  const item = NAV_ITEMS.filter((i) => i.id.startsWith("pcf") && isActivePath(i.href, pathname)).sort((a, b) => b.href.length - a.href.length)[0];
  return item?.id ?? null;
}

/** For every petty cash page: signed in, a petty cash role that allows the page, and the module not hidden from them. */
export async function requireUser(pathname: string): Promise<CurrentUser> {
  const app = await getAppUser();
  if (!app) redirect("/login");
  const user = await getCurrentUser();
  const mod = moduleForPath(pathname);
  if (!user || !mod || !app.modules.includes(mod) || !canAccessRoute(user.role, pathname)) forbidden();
  return user;
}

export async function getAdminUser(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  return user?.role === "admin" ? user : null;
}
