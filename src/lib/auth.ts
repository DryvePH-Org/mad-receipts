import "server-only";
import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { effectiveModules, type ModuleId } from "@/lib/navigation";

import { roleFromDb, type Role } from "@/lib/roles";
export type { Role } from "@/lib/roles";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  /** the modules this person has: their role's, plus or minus what the Admin changed for them */
  modules: ModuleId[];
  /** what the Admin added or hid for this person, for the Users page */
  grants: string[];
  denies: string[];
}

// The logged-in user and their role.
// The signed session is checked on this server against the project's public keys (no trip to the sign-in server on every page), and the person's profile is read
// in ONE query. A switched-off account is caught by the profile's `disabled` flag, so it stops at once. Cached per request, so calling it from several components is cheap.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  const id = claims.sub;

  // One query for everything. If the newest columns are not there yet (a database update is not applied), the older, narrower reads are tried.
  let row: Record<string, unknown> | null = null;
  for (const cols of ["full_name, role, module_grants, module_denies, disabled", "full_name, role, module_grants, module_denies", "full_name, role"]) {
    const r = await supabase.from("profiles").select(cols).eq("id", id).single();
    if (!r.error) { row = r.data as unknown as Record<string, unknown>; break; }
  }
  if (row?.disabled === true) return null; // switched off: the same as signed out
  const grants = Array.isArray(row?.module_grants) ? (row.module_grants as string[]) : [];
  const denies = Array.isArray(row?.module_denies) ? (row.module_denies as string[]) : [];
  const profile = row as { full_name?: string | null; role?: string | null } | null;
  const role: Role = roleFromDb(profile?.role);

  return {
    id,
    email: typeof claims.email === "string" ? claims.email : "",
    fullName: profile?.full_name ?? null,
    // No profile row means no elevated rights.
    role,
    modules: effectiveModules(role, grants, denies),
    grants,
    denies,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** 403 unless the signed-in user has one of the roles. */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) forbidden();
  return user;
}

/** 403 unless the signed-in user has this module (their role's, plus or minus what the Admin changed). Use it on every page and action of a module. */
export async function requireModule(id: ModuleId): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.modules.includes(id)) forbidden();
  return user;
}

/** 403 unless the signed-in user has at least one of these modules. */
export async function requireAnyModule(...ids: ModuleId[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!ids.some((id) => user.modules.includes(id))) forbidden();
  return user;
}

/** 403 unless the signed-in user is an Admin or a Super Admin: prices, decisions, deleting a transaction or a car. */
export const requireAdmin = () => requireRole("admin", "super_admin");

/** For every administration page, action and API route (Settings, Users, Sync jobs, the bot set-up): 403 unless Super Admin. */
export const requireSuper = () => requireRole("super_admin");
