"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
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
  const { error } = await admin.from("profiles").update({ role: parsed.data.role }).eq("id", parsed.data.userId);
  if (error) return { ok: false, message: "Could not change the role." };
  await admin.from("audit_logs").insert({ actor_id: actor.id, action: "user.role", entity: "user", entity_id: parsed.data.userId, before: { role: before?.role }, after: { full_name: before?.full_name, role: parsed.data.role } });
  revalidatePath("/admin/users");
  return { ok: true, message: "Role changed." };
}
