"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { docsDb } from "@/lib/docsbible/review-server";

export type PeopleResult = { ok: true } | { ok: false; error: string };
const person = z.object({ tgId: z.number().int().positive(), name: z.string().trim().min(1).max(80), role: z.enum(["repairman", "approver", "admin"]) });

/** The Admin says who may use the repairs bot in Telegram (their Telegram id comes from the bot's /whoami). */
export async function savePersonAction(raw: z.input<typeof person>): Promise<PeopleResult> {
  await requireRole("admin");
  const p = person.safeParse(raw);
  if (!p.success) return { ok: false, error: "Type the Telegram id (digits), the name and the role." };
  const { error } = await docsDb().from("repair_people").upsert({ tg_id: p.data.tgId, name: p.data.name, role: p.data.role, active: true, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: `Could not save: ${error.message}` };
  revalidatePath("/repairs");
  return { ok: true };
}

export async function removePersonAction(tgId: number): Promise<PeopleResult> {
  await requireRole("admin");
  if (!Number.isInteger(tgId) || tgId <= 0) return { ok: false, error: "That person was not found." };
  const { error } = await docsDb().from("repair_people").update({ active: false, updated_at: new Date().toISOString() }).eq("tg_id", tgId);
  if (error) return { ok: false, error: `Could not remove: ${error.message}` };
  revalidatePath("/repairs");
  return { ok: true };
}
