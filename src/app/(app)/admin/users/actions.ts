"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireModule, requireSuper } from "@/lib/auth";
import { canAssignRole, canManageUser } from "@/lib/user-rules";
import { ADMIN_FLOOR, GRANTABLE, isModuleId, SENSITIVE, type ModuleId } from "@/lib/navigation";
import { userChanged } from "@/lib/notify/events";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResult = { ok: boolean; message: string } | null;

const password = z.string().min(8, "Password must be at least 8 characters.").max(72);

const createUserSchema = z.object({
  fullName: z.string().trim().min(1, "Enter the person's name.").max(100),
  email: z.email("Enter a valid email.").max(254),
  password,
  role: z.enum(["sales", "buying", "documentation", "marketing", "admin", "super_admin"]),
});

// Creates an account with the chosen role (Sales, Approver or Admin).
export async function createUser(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requireModule("users");

  const parsed = createUserSchema.safeParse({
    fullName: form.get("fullName"),
    email: String(form.get("email") ?? "").trim().toLowerCase(),
    password: form.get("password"),
    role: form.get("role"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  if (form.get("confirm") !== null && form.get("confirm") !== parsed.data.password) return { ok: false, message: "The two passwords are not the same." };
  const { fullName, email, role } = parsed.data;
  if (!canAssignRole(actor.role, role)) return { ok: false, message: "Only a Super Admin can create an Admin or a Super Admin." };

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
  after(() => userChanged(actor.id, `New user: ${fullName} (${role})`));
  return { ok: true, message: `Created ${fullName}. They can log in now.` };
}

const resetSchema = z.object({ userId: z.uuid(), password });

export async function resetPassword(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requireModule("users");

  const parsed = resetSchema.safeParse({
    userId: form.get("userId"),
    password: form.get("password"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  if (form.get("confirm") !== null && form.get("confirm") !== parsed.data.password) return { ok: false, message: "The two passwords are not the same." };

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("role").eq("id", parsed.data.userId).single();
  if (!canManageUser(actor.role, target?.role ?? "sales")) return { ok: false, message: "Only a Super Admin can change an Admin's account." };
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

const roleSchema = z.object({ userId: z.uuid(), role: z.enum(["sales", "buying", "documentation", "marketing", "admin", "super_admin"]) });

/** Changes what someone may do. A Super Admin cannot take their own role away (someone must stay in charge). */
export async function changeRole(userId: string, role: string): Promise<{ ok: boolean; message: string }> {
  const actor = await requireModule("users");
  const parsed = roleSchema.safeParse({ userId, role });
  if (!parsed.success) return { ok: false, message: "That role is not valid." };
  if (!canAssignRole(actor.role, parsed.data.role)) return { ok: false, message: "Only a Super Admin can make someone an Admin or a Super Admin." };
  if (parsed.data.userId === actor.id && actor.role !== "super_admin") return { ok: false, message: "You cannot change your own role." };
  if (parsed.data.userId === actor.id && parsed.data.role !== "super_admin") return { ok: false, message: "You cannot remove your own Super Admin role. Ask another Super Admin." };
  const admin = createAdminClient();
  const { data: before } = await admin.from("profiles").select("full_name, role").eq("id", parsed.data.userId).single();
  if (!canManageUser(actor.role, before?.role ?? "sales")) return { ok: false, message: "Only a Super Admin can change an Admin." };
  if (before?.role === "super_admin" && parsed.data.role !== "super_admin" && (await adminCount(admin)) <= 1) return { ok: false, message: "That is the only Super Admin. Make someone else a Super Admin first." };
  const { error } = await admin.from("profiles").update({ role: parsed.data.role }).eq("id", parsed.data.userId);
  if (error) return { ok: false, message: "Could not change the role." };
  await admin.from("audit_logs").insert({ actor_id: actor.id, action: "user.role", entity: "user", entity_id: parsed.data.userId, before: { role: before?.role }, after: { full_name: before?.full_name, role: parsed.data.role } });
  revalidatePath("/admin/users");
  after(() => userChanged(actor.id, `${before?.full_name ?? "A user"} is now ${parsed.data.role}${before?.role ? ` (was ${before.role})` : ""}`));
  return { ok: true, message: "Role changed." };
}

async function adminCount(admin: ReturnType<typeof createAdminClient>): Promise<number> {
  const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "super_admin");
  return count ?? 0;
}

const accessSchema = z.object({ userId: z.uuid(), grants: z.array(z.string()).max(20), denies: z.array(z.string()).max(20) });

/**
 * Gives one person extra modules, or hides modules from them, on top of their role. Only grantable modules can be added, hiding
 * wins, an Admin keeps Users and Settings, and nobody changes their own access (so a mistake cannot lock the Admin out).
 */
export async function setModuleAccess(userId: string, grants: string[], denies: string[], typed = ""): Promise<{ ok: boolean; message: string }> {
  const actor = await requireSuper();
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
  const denies_ = (d as ModuleId[]).filter((m) => !(role === "super_admin" && ADMIN_FLOOR.includes(m)));
  // Giving approving, Settings, Users or Sync jobs to someone new needs the word GRANT typed, checked here as well as in the box.
  const had = new Set<string>(before.module_grants ?? []);
  const newPower = grants_.filter((m) => SENSITIVE.includes(m) && !had.has(m));
  if (newPower.length && typed.trim() !== "GRANT") return { ok: false, message: "Type GRANT to give a module with this much power." };
  const { error } = await admin.from("profiles").update({ module_grants: grants_, module_denies: denies_ }).eq("id", parsed.data.userId);
  if (error) return { ok: false, message: "Could not save. Has the latest database update been applied?" };
  await admin.from("audit_logs").insert({ actor_id: actor.id, action: "user.access", entity: "user", entity_id: parsed.data.userId, before: { grants: before.module_grants, denies: before.module_denies }, after: { full_name: before.full_name, grants: grants_, denies: denies_ } });
  revalidatePath("/admin/users");
  return { ok: true, message: "Access saved. It applies the next time they open a page." };
}

/** Switches an account off (it cannot log in, and open sessions stop working) or back on. Nothing is deleted. */
export async function setUserActive(userId: string, active: boolean): Promise<{ ok: boolean; message: string }> {
  const actor = await requireModule("users");
  const id = z.uuid().safeParse(userId);
  if (!id.success) return { ok: false, message: "That user was not found." };
  if (id.data === actor.id) return { ok: false, message: "You cannot disable your own account." };
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("full_name, role").eq("id", id.data).single();
  if (!canManageUser(actor.role, target?.role ?? "sales")) return { ok: false, message: "Only a Super Admin can change an Admin." };
  if (!active && target?.role === "super_admin" && (await adminCount(admin)) <= 1) return { ok: false, message: "That is the only Super Admin." };
  const { error } = await admin.auth.admin.updateUserById(id.data, { ban_duration: active ? "none" : "876000h" });
  if (error) return { ok: false, message: active ? "Could not enable the account." : "Could not disable the account." };
  await admin.from("audit_logs").insert({ actor_id: actor.id, action: active ? "user.enable" : "user.disable", entity: "user", entity_id: id.data, after: { full_name: target?.full_name } });
  revalidatePath("/admin/users");
  return { ok: true, message: active ? "Account enabled." : "Account disabled. They can no longer log in." };
}

/**
 * Removes an account for good. Only a person with no history can go: anyone who made a receipt, approved something or did documents work is
 * kept in those records, so the database refuses and the message says to disable them instead (which keeps everything). Not yourself, not the last Admin.
 */
export async function deleteUser(userId: string): Promise<{ ok: boolean; message: string }> {
  const actor = await requireModule("users");
  const id = z.uuid().safeParse(userId);
  if (!id.success) return { ok: false, message: "That user was not found." };
  if (id.data === actor.id) return { ok: false, message: "You cannot remove your own account." };
  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("full_name, role").eq("id", id.data).single();
  if (!target) return { ok: false, message: "That user was not found." };
  if (!canManageUser(actor.role, target.role)) return { ok: false, message: "Only a Super Admin can remove an Admin." };
  if (target.role === "super_admin" && (await adminCount(admin)) <= 1) return { ok: false, message: "That is the only Super Admin." };
  const { error } = await admin.auth.admin.deleteUser(id.data);
  if (error) return { ok: false, message: `${target.full_name} has receipts, approvals or other work in their name, so they cannot be removed without breaking those records. Disable the account instead: they cannot log in, and everything stays.` };
  await admin.from("audit_logs").insert({ actor_id: actor.id, action: "user.delete", entity: "user", entity_id: null, after: { user: id.data, full_name: target.full_name, role: target.role } });
  revalidatePath("/admin/users");
  after(() => userChanged(actor.id, `${target.full_name} (${target.role}) was removed`));
  return { ok: true, message: `${target.full_name} was removed.` };
}
