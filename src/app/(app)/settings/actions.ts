"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { parseSettings } from "@/lib/deal/settings";
import { friendlyError } from "@/lib/deal/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

export type SaveResult = { ok: true } | { ok: false; error: string };

/** Saves the Admin's settings. Whatever is sent is cleaned first: a bad part falls back to its default. */
export async function saveSettings(config: unknown): Promise<SaveResult> {
  const user = await requireAdmin();
  const clean = parseSettings(config);
  const { error } = await createAdminClient().rpc("update_settings", { p_actor: user.id, p_config: clean as unknown as Json });
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidatePath("/", "layout");
  return { ok: true };
}
