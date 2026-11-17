"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModule } from "@/lib/auth";
import { loadHistory, saveCell, type HistoryRow } from "@/lib/docsbible/grid-server";

/** One cell of the Docs Bible table. The role rules (Documentation edits the paper columns, Admin everything) are enforced here, not only on the page. */
export async function saveCellAction(unitId: string, key: string, value: string, expected: string | null): Promise<{ ok: boolean; message?: string; value?: string | null }> {
  const user = await requireModule("register");
  const id = z.uuid().safeParse(unitId);
  if (!id.success || typeof key !== "string" || typeof value !== "string" || value.length > 4100 || (expected !== null && typeof expected !== "string")) return { ok: false, message: "Bad request." };
  const r = await saveCell(user.role, user.id, id.data, key, value, expected);
  if (r.ok) revalidatePath("/docs-bible");
  return r.ok ? { ok: true, value: r.value } : { ok: false, message: r.message };
}

export async function historyAction(unitId: string): Promise<HistoryRow[]> {
  await requireModule("register");
  const id = z.uuid().safeParse(unitId);
  return id.success ? loadHistory(id.data) : [];
}
