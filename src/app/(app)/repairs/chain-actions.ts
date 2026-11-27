"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuper } from "@/lib/auth";
import { saveChain } from "@/lib/repairs/approval-chain";

export type ChainResult = { ok: true } | { ok: false; error: string };
const rows = z.array(z.object({ userId: z.string().uuid(), waitMinutes: z.number().int().min(5).max(1440) })).max(20);

/** The Super Admin says who is asked first to approve a repair report, and who next when nobody decides in time. */
export async function saveApprovalChainAction(raw: z.input<typeof rows>): Promise<ChainResult> {
  await requireSuper();
  const p = rows.safeParse(raw);
  if (!p.success) return { ok: false, error: "Some values are not valid." };
  const r = await saveChain(p.data);
  if (r.ok) revalidatePath("/repairs");
  return r;
}
