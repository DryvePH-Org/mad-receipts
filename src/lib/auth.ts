import "server-only";
import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Sales fill in receipts, the Approver approves every one, Documentation watches the car papers, the Admin manages everything else. */
export type Role = "sales" | "admin" | "approver" | "documentation";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
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

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: profile?.full_name ?? null,
    // No profile row means no elevated rights.
    role: profile?.role === "admin" ? "admin" : profile?.role === "approver" ? "approver" : profile?.role === "documentation" ? "documentation" : "sales",
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

// For every admin page, admin server action and admin API route: 403 unless admin.
export const requireAdmin = () => requireRole("admin");
export const requireApprover = () => requireRole("approver");
