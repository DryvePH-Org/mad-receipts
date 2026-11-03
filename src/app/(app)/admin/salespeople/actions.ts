"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { MAX_NAME_LENGTH, normalizeName, parseAliases } from "@/lib/salespeople/names";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResult = { ok: boolean; message: string } | null;

type Admin = ReturnType<typeof createAdminClient>;

const name = z.string().trim().min(1, "Enter the name.").max(MAX_NAME_LENGTH, "That name is too long.");

/** A name or alias must not already belong to someone else, or the voice matching gets ambiguous. */
async function clash(admin: Admin, words: string[], exceptId?: string): Promise<string | null> {
  const { data } = await admin.from("salespeople").select("id, name, aliases");
  const taken = new Map<string, string>();
  for (const person of data ?? []) {
    if (person.id === exceptId) continue;
    for (const word of [person.name, ...person.aliases]) taken.set(normalizeName(word), person.name);
  }
  for (const word of words) {
    const owner = taken.get(normalizeName(word));
    if (owner) return `"${word}" is already used by ${owner}.`;
  }
  return null;
}

/** Aliases that are just the name again are pointless; drop them. */
const withoutName = (fullName: string, aliases: string[]) =>
  aliases.filter((alias) => normalizeName(alias) !== normalizeName(fullName));

export async function addSalesperson(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();
  const parsedName = name.safeParse(form.get("name"));
  if (!parsedName.success) return { ok: false, message: parsedName.error.issues[0].message };

  const fullName = parsedName.data;
  const aliases = withoutName(fullName, parseAliases(String(form.get("aliases") ?? "")));

  const admin = createAdminClient();
  const conflict = await clash(admin, [fullName, ...aliases]);
  if (conflict) return { ok: false, message: conflict };

  const { data, error } = await admin.from("salespeople").insert({ name: fullName, aliases }).select("id").single();
  if (error) return { ok: false, message: "Could not add the name." };

  await admin.from("audit_logs").insert({
    actor_id: actor.id,
    action: "salesperson.create",
    entity: "salesperson",
    entity_id: data.id,
    after: { name: fullName, aliases },
  });
  revalidatePath("/admin/salespeople");
  return { ok: true, message: `Added ${fullName}.` };
}

export async function updateSalesperson(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  const actor = await requireAdmin();
  const id = z.uuid().safeParse(form.get("id"));
  const parsedName = name.safeParse(form.get("name"));
  if (!id.success) return { ok: false, message: "Could not find that person." };
  if (!parsedName.success) return { ok: false, message: parsedName.error.issues[0].message };

  const fullName = parsedName.data;
  const aliases = withoutName(fullName, parseAliases(String(form.get("aliases") ?? "")));

  const admin = createAdminClient();
  const { data: before } = await admin.from("salespeople").select("name, aliases, active").eq("id", id.data).maybeSingle();
  if (!before) return { ok: false, message: "Could not find that person." };

  const conflict = await clash(admin, [fullName, ...aliases], id.data);
  if (conflict) return { ok: false, message: conflict };

  const { error } = await admin.from("salespeople").update({ name: fullName, aliases }).eq("id", id.data);
  if (error) return { ok: false, message: "Could not save the changes." };

  await admin.from("audit_logs").insert({
    actor_id: actor.id,
    action: "salesperson.update",
    entity: "salesperson",
    entity_id: id.data,
    before,
    after: { name: fullName, aliases, active: before.active },
  });
  revalidatePath("/admin/salespeople");
  return { ok: true, message: "Saved." };
}

/** Stops a name from being offered for new sales. Past deals keep their salespeople. */
export async function setSalespersonActive(form: FormData): Promise<void> {
  const actor = await requireAdmin();
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return;
  const active = form.get("active") === "true";

  const admin = createAdminClient();
  const { error } = await admin.from("salespeople").update({ active }).eq("id", id.data);
  if (error) return;

  await admin.from("audit_logs").insert({
    actor_id: actor.id,
    action: active ? "salesperson.activate" : "salesperson.deactivate",
    entity: "salesperson",
    entity_id: id.data,
    after: { active },
  });
  revalidatePath("/admin/salespeople");
}
