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
});

// Creates a staff account. New users always start as staff (profile trigger).
export async function createStaffUser(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();

  const parsed = createUserSchema.safeParse({
    fullName: form.get("fullName"),
    email: String(form.get("email") ?? "").trim().toLowerCase(),
    password: form.get("password"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { fullName, email } = parsed.data;

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

  await admin.from("audit_logs").insert({
    actor_id: actor.id,
    action: "user.create",
    entity: "user",
    entity_id: data.user.id,
    after: { email, full_name: fullName, role: "staff" },
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
