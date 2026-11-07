"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModule } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { processDueJobs } from "@/lib/sync/process";

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
