"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { ADMIN_FLOOR, GRANTABLE, isModuleId, type ModuleId } from "@/lib/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResult = { ok: boolean; message: string } | null;

const password = z.string().min(8, "Password must be at least 8 characters.").max(72);

const createUserSchema = z.object({
  fullName: z.string().trim().min(1, "Enter the person's name.").max(100),
  email: z.email("Enter a valid email.").max(254),
  password,
  role: z.enum(["sales", "approver", "documentation", "admin"]),
});

// Creates an account with the chosen role (Sales, Approver or Admin).
export async function createUser(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();

  const parsed = createUserSchema.safeParse({
    fullName: form.get("fullName"),
    email: String(form.get("email") ?? "").trim().toLowerCase(),
    password: form.get("password"),
    role: form.get("role"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { fullName, email, role } = parsed.data;

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) {
    const taken = /already|registered|exists/i.test(error.message);
    return { ok: false, message: taken ? "That email already has an account." : "Could not create the user." };
  }

  if (role !== "sales") await admin.from("profiles").update({ role }).eq("id", data.user.id);
  await admin.from("audit_logs").insert({
    actor_id: actor.id,
    action: "user.create",
    entity: "user",
    entity_id: data.user.id,
    after: { email, full_name: fullName, role },
  });

  revalidatePath("/admin/users");
  return { ok: true, message: `Created ${fullName}. They can log in now.` };
}

const resetSchema = z.object({ userId: z.uuid(), password });

export async function resetPassword(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();

  const parsed = resetSchema.safeParse({
    userId: form.get("userId"),
    password: form.get("password"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(parsed.data.userId, {
    password: parsed.data.password,
  });
  if (error) return { ok: false, message: "Could not reset the password." };

  await admin.from("audit_logs").insert({
    actor_id: actor.id,
    action: "user.reset_password",
    entity: "user",
    entity_id: parsed.data.userId,
  });

  return { ok: true, message: "Password updated." };
}

const roleSchema = z.object({ userId: z.uuid(), role: z.enum(["sales", "approver", "documentation", "admin"]) });

/** Changes what someone may do. An Admin cannot take their own Admin role away (someone must stay in charge). */
export async function changeRole(userId: string, role: string): Promise<{ ok: boolean; message: string }> {
  const actor = await requireAdmin();
  const parsed = roleSchema.safeParse({ userId, role });
  if (!parsed.success) return { ok: false, message: "That role is not valid." };
  if (parsed.data.userId === actor.id && parsed.data.role !== "admin") return { ok: false, message: "You cannot remove your own Admin role. Ask another Admin." };
  const admin = createAdminClient();
  const { data: before } = await admin.from("profiles").select("full_name, role").eq("id", parsed.data.userId).single();
  if (before?.role === "admin" && parsed.data.role !== "admin" && (await adminCount(admin)) <= 1) return { ok: false, message: "That is the only Admin. Make someone else an Admin first." };
  const { error } = await admin.from("profiles").update({ role: parsed.data.role }).eq("id", parsed.data.userId);
  if (error) return { ok: false, message: "Could not change the role." };
  await admin.from("audit_logs").insert({ actor_id: actor.id, action: "user.role", entity: "user", entity_id: parsed.data.userId, before: { role: before?.role }, after: { full_name: before?.full_name, role: parsed.data.role } });
  revalidatePath("/admin/users");
  return { ok: true, message: "Role changed." };
}

async function adminCount(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  return count ?? 0;
}

const accessSchema = z.object({ userId: z.uuid(), grants: z.array(z.string()).max(20), denies: z.array(z.string()).max(20) });

/**
 * Gives one person extra modules, or hides modules from them, on top of their role. Only grantable modules can be added, hiding
 * wins, an Admin keeps Users and Settings, and nobody changes their own access (so a mistake cannot lock the Admin out).
 */
export async function setModuleAccess(userId: string, grants: string[], denies: string[]): Promise<{ ok: boolean; message: string }> {
  const actor = await requireAdmin();
  const parsed = accessSchema.safeParse({ userId, grants, denies });
  if (!parsed.success) return { ok: false, message: "That change is not valid." };
  if (parsed.data.userId === actor.id) return { ok: false, message: "You cannot change your own access. Ask another Admin." };
  const g = [...new Set(parsed.data.grants)], d = [...new Set(parsed.data.denies)];
  if (![...g, ...d].every(isModuleId)) return { ok: false, message: "That module does not exist." };
  const admin = createAdminClient();
  const { data: before, error: readError } = await admin.from("profiles").select("full_name, role, module_grants, module_denies").eq("id", parsed.data.userId).single();
  if (readError || !before) return { ok: false, message: "Could not read that user. Has the latest database update been applied?" };
  const role = before.role;
  const grants_ = (g as ModuleId[]).filter((m) => GRANTABLE.includes(m) && !d.includes(m));
  const denies_ = (d as ModuleId[]).filter((m) => !(role === "admin" && ADMIN_FLOOR.includes(m)));
  const { error } = await admin.from("profiles").update({ module_grants: grants_, module_denies: denies_ }).eq("id", parsed.data.userId);
  if (error) return { ok: false, message: "Could not save. Has the latest database update been applied?" };
  await admin.from("audit_logs").insert({ actor_id: actor.id, action: "user.access", entity: "user", entity_id: parsed.data.userId, before: { grants: before.module_grants, denies: before.module_denies }, after: { full_name: before.full_name, grants: grants_, denies: denies_ } });
  revalidatePath("/admin/users");
  return { ok: true, message: "Access saved. It applies the next time they open a page." };
}

/** Switches an account off (it cannot log in, and open sessions stop working) or back on. Nothing is deleted. */
export async function setUserActive(userId: string, active: boolean): Promise<{ ok: boolean; message: string }> {
  const actor = await requireAdmin();
  const id = z.uuid().safeParse(userId);
  if (!id.success) return { ok: false, message: "That user was not found." };
  if (id.data === actor.id) return { ok: false, message: "You cannot disable your own account." };
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("full_name, role").eq("id", id.data).single();
  if (!active && target?.role === "admin" && (await adminCount(admin)) <= 1) return { ok: false, message: "That is the only Admin." };
  const { error } = await admin.auth.admin.updateUserById(id.data, { ban_duration: active ? "none" : "876000h" });
  if (error) return { ok: false, message: active ? "Could not enable the account." : "Could not disable the account." };
  await admin.from("audit_logs").insert({ actor_id: actor.id, action: active ? "user.enable" : "user.disable", entity: "user", entity_id: id.data, after: { full_name: target?.full_name } });
  revalidatePath("/admin/users");
  return { ok: true, message: active ? "Account enabled." : "Account disabled. They can no longer log in." };
}
