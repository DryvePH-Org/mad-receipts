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

// The logged-in user and their role, verified with the auth server.
// Cached per request, so calling it from several components is cheap.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("full_name, role").eq("id", user.id).single();

  // The per-person changes live in two extra columns. If they cannot be read (the migration is not applied yet), the role's own modules apply.
  const { data: extra } = await supabase.from("profiles").select("module_grants, module_denies").eq("id", user.id).single();
  const grants = Array.isArray(extra?.module_grants) ? (extra.module_grants as string[]) : [];
  const denies = Array.isArray(extra?.module_denies) ? (extra.module_denies as string[]) : [];
  const role: Role = roleFromDb(profile?.role);

  return {
    id: user.id,
    email: user.email ?? "",
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
