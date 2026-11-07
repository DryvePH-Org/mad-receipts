"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { processDueJobs, writeInventoryAnyway } from "@/lib/sync/process";

/** Retry one job right now: reset it, then run it. The page shows how it went. */
export async function retrySyncJob(form: FormData): Promise<void> {
  const actor = await requireModule("sync");
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return;

  const admin = createAdminClient();
  const { data: job } = await admin
    .from("sync_jobs")
    .update({ status: "pending", attempts: 0, last_error: null, next_run_at: new Date().toISOString() })
    .eq("id", id.data)
    .select("receipt_id, target, event")
    .maybeSingle();
  if (!job) return;

  await admin.from("audit_logs").insert({
    actor_id: actor.id,
    action: "sync.retry",
    entity: "sync_job",
    entity_id: id.data,
    after: { target: job.target, event: job.event },
  });

  await processDueJobs({ receiptId: job.receipt_id }).catch((err) =>
    console.error(`[sync] retry failed: ${err instanceof Error ? err.message : "unknown error"}`),
  );
  revalidatePath("/admin/sync");
}

/** Run everything that is due now, without waiting for the scheduler. */
export async function runSyncNow(): Promise<void> {
  await requireModule("sync");
  await processDueJobs().catch((err) =>
    console.error(`[sync] manual run failed: ${err instanceof Error ? err.message : "unknown error"}`),
  );
  revalidatePath("/admin/sync");
}

/** A conflict was looked at: keep the sheet's note (nothing is written, the job is closed) or write the app's note anyway. */
export async function resolveConflict(form: FormData): Promise<void> {
  const actor = await requireModule("sync");
  const id = z.uuid().safeParse(form.get("id"));
  const choice = z.enum(["keep", "overwrite"]).safeParse(form.get("choice"));
  if (!id.success || !choice.success) return;
  const admin = createAdminClient();
  const { data: job } = await admin.from("sync_jobs").select("receipt_id, target, status, last_error").eq("id", id.data).maybeSingle();
  if (!job || job.status === "done" || !job.last_error?.startsWith("CONFLICT:")) return;
  if (choice.data === "overwrite") {
    if (job.target !== "inventory") return; // only the inventory note can be written over; a wrong log sheet must be fixed first
    try { await writeInventoryAnyway(job.receipt_id); } catch (err) {
      console.error(`[sync] overwrite failed: ${err instanceof Error ? err.message : "unknown error"}`);
      await admin.from("sync_jobs").update({ last_error: `CONFLICT: Could not write the note (${err instanceof Error ? err.message.slice(0, 200) : "unknown error"}). ${job.last_error.slice("CONFLICT: ".length)}` }).eq("id", id.data);
      revalidatePath("/admin/sync");
      return;
    }
  }
  await admin.from("sync_jobs").update({ status: "done", last_error: null }).eq("id", id.data);
  await admin.from("audit_logs").insert({ actor_id: actor.id, action: choice.data === "keep" ? "sync.keep_sheet" : "sync.overwrite", entity: "sync_job", entity_id: id.data, after: { target: job.target } });
  revalidatePath("/admin/sync");
}
