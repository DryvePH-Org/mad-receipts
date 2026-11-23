"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import type { Choice } from "@/lib/pricelist/sync";
import { settleSyncItem } from "@/lib/pricelist/sync-server";

export type Settled = { ok: true; decision: string } | { ok: false; error: string };

/** One item of the data check: use the price list's value, use the Docs Bible's, or note it. Everyone who edits the car papers. */
export async function settleAction(id: string, choice: Choice, plate?: string): Promise<Settled> {
  const user = await requireRole("super_admin", "admin", "buying", "sales");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["list", "docs", "noted", "add", "plate"].includes(choice)) return { ok: false, error: "That item was not found." };
  const r = await settleSyncItem(id, choice, user.id, { plate });
  if (r.ok) { revalidatePath("/cars/sync"); revalidatePath("/documents", "layout"); revalidatePath("/cars"); revalidatePath("/documents"); }
  return r;
}
