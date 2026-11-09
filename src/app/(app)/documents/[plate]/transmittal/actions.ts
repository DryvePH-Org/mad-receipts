"use server";

import { z } from "zod";
import { requireModule } from "@/lib/auth";
import { saveTransmittal } from "@/lib/docs/transmittal-server";
import { createAdminClient } from "@/lib/supabase/admin";

const plateSchema = z.string().min(5).max(20);

/** Saves the transmittal of one car. Anyone with the Car documents module may. */
export async function saveTransmittalAction(plate: string, data: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireModule("documents");
  const p = plateSchema.safeParse(plate);
  if (!p.success) return { ok: false, error: "That plate is not valid." };
  const r = await saveTransmittal(p.data, data, user.id);
  if (r.ok) await createAdminClient().from("audit_logs").insert({ actor_id: user.id, action: "docs.transmittal", entity: "car", entity_id: null, after: { plate: p.data } });
  return r;
}
