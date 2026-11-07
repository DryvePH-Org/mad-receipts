"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { phraseMatches, resetInfo } from "@/lib/reset";
import { countData, runReset, type ResetCounts } from "@/lib/reset-run";
import { createAdminClient } from "@/lib/supabase/admin";

export type ResetResult = { ok: true; message: string } | { ok: false; error: string };

/** How much there is to delete, for the Reset tab. */
export async function getResetCounts(): Promise<ResetCounts> {
  await requireAdmin();
  return countData(createAdminClient());
}

/** Deletes data for the Admin, only if the typed words match exactly (checked here, not only in the browser). */
export async function resetData(kind: string, typed: string): Promise<ResetResult> {
  const user = await requireAdmin();
  const info = resetInfo(kind);
  if (!info) return { ok: false, error: "That is not something that can be deleted." };
  if (!phraseMatches(kind, String(typed ?? ""))) return { ok: false, error: `Type ${info.phrase} exactly to confirm.` };
  try {
    const counts = await runReset(createAdminClient(), info.kind, user.id);
    revalidatePath("/", "layout");
    const parts = [["deals", "deals"], ["receipts", "receipts"], ["proofFiles", "proof files"], ["sync_jobs", "sync jobs"], ["audit_logs", "activity lines"], ["unit_folders", "car folders"]]
      .filter(([k]) => counts[k]).map(([k, label]) => `${counts[k]} ${label}`);
    return { ok: true, message: parts.length ? `Deleted ${parts.join(", ")}.` : "Nothing to delete. It was already empty." };
  } catch (e) {
    console.error(`[reset] ${kind} failed: ${e instanceof Error ? e.message : "unknown"}`);
    return { ok: false, error: "Something went wrong part-way. Nothing else was touched. Press the button again to finish." };
  }
}
