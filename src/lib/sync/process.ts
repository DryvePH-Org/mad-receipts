import "server-only";
import { createDriveClient } from "@/lib/google/drive";
import { createSheetsClient } from "@/lib/google/sheets";
import { inventory } from "@/lib/inventory";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";
import { createTelegramClient } from "@/lib/telegram";
import { syncTargets, TARGET_ORDER, type SyncContext, type SyncDeps, type SyncTarget } from "./targets";

/** Wait before the next try, by failed attempts so far (section: Phase 9, step 1). */
export const BACKOFF_MINUTES = [1, 5, 15, 60, 360];
export const MAX_ATTEMPTS = 5;

type Job = Tables<"sync_jobs">;
type Admin = ReturnType<typeof createAdminClient>;

export interface SyncRunSummary {
  claimed: number;
  done: number;
  failed: number;
}

function memo<T>(make: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= make());
}

/** Real clients, created on first use so one missing config only fails its own target. */
export function defaultSyncDeps(): SyncDeps {
  return {
    sheets: memo(createSheetsClient),
    drive: memo(createDriveClient),
    telegram: memo(createTelegramClient),
    inventory,
    config: {
      driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID,
      logSheetId: process.env.GOOGLE_SHEET_ID,
    },
  };
}

/**
 * Runs due sync jobs (pending or failed, next_run_at reached, fewer than 5 attempts).
 * A failure never touches the saved receipt: the job records the error and retries later.
 */
export async function processDueJobs(
  options: { receiptId?: string; limit?: number; deps?: SyncDeps; admin?: Admin } = {},
): Promise<SyncRunSummary> {
  const admin = options.admin ?? createAdminClient();
  const deps = options.deps ?? defaultSyncDeps();

  const { data: jobs, error } = await admin.rpc("claim_sync_jobs", {
    p_limit: options.limit ?? 20,
    p_receipt_id: options.receiptId,
  });
  if (error) throw new Error(`Could not claim sync jobs: ${error.message}`);

  const summary: SyncRunSummary = { claimed: jobs.length, done: 0, failed: 0 };
  const byReceipt = new Map<string, Job[]>();
  for (const job of jobs) byReceipt.set(job.receipt_id, [...(byReceipt.get(job.receipt_id) ?? []), job]);

  for (const [receiptId, receiptJobs] of byReceipt) {
    receiptJobs.sort((a, b) => TARGET_ORDER.indexOf(a.target as SyncTarget) - TARGET_ORDER.indexOf(b.target as SyncTarget));

    let ctx: SyncContext;
    try {
      ctx = await loadContext(admin, receiptId);
    } catch (err) {
      for (const job of receiptJobs) await markFailed(admin, job, err);
      summary.failed += receiptJobs.length;
      continue;
    }

    for (const job of receiptJobs) {
      try {
        const result = await syncTargets[job.target as SyncTarget](ctx, deps);
        if (result?.driveFileId) {
          const { error: saveError } = await admin
            .from("receipts")
            .update({ drive_file_id: result.driveFileId })
            .eq("id", receiptId);
          if (saveError) throw new Error(`Uploaded, but could not save the Drive file id: ${saveError.message}`);
          ctx.receipt.drive_file_id = result.driveFileId; // so the Sheets row gets the link
        }
        await markDone(admin, job);
        summary.done++;
      } catch (err) {
        await markFailed(admin, job, err);
        summary.failed++;
      }
    }
  }

  return summary;
}

async function loadContext(admin: Admin, receiptId: string): Promise<SyncContext> {
  const { data: receipt, error } = await admin
    .from("receipts")
    .select("*, deal:deals(*), creator:profiles(full_name)")
    .eq("id", receiptId)
    .single();
  if (error || !receipt) throw new Error(`Could not load the receipt: ${error?.message ?? "not found"}`);

  const { data: last } = await admin
    .from("receipts")
    .select("receipt_no")
    .eq("deal_id", receipt.deal_id)
    .eq("status", "confirmed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { deal, creator, ...receiptRow } = receipt;
  let photo: Promise<Uint8Array> | undefined;

  return {
    receipt: receiptRow,
    deal,
    confirmedBy: creator?.full_name ?? "",
    lastReceiptNo: last?.receipt_no ?? receipt.receipt_no,
    photo: () =>
      (photo ??= (async () => {
        if (!receipt.photo_path) throw new Error("The receipt has no photo");
        const file = await admin.storage.from("receipt-photos").download(receipt.photo_path);
        if (file.error) throw new Error(`Could not read the photo: ${file.error.message}`);
        return new Uint8Array(await file.data.arrayBuffer());
      })()),
  };
}

async function markDone(admin: Admin, job: Job) {
  await admin.from("sync_jobs").update({ status: "done", last_error: null }).eq("id", job.id);
  console.info(`[sync] job=${job.id} target=${job.target} status=done`);
}

async function markFailed(admin: Admin, job: Job, err: unknown) {
  const attempts = job.attempts + 1;
  const waitMinutes = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length) - 1];
  await admin
    .from("sync_jobs")
    .update({
      status: "failed",
      attempts,
      last_error: errorText(err),
      next_run_at: new Date(Date.now() + waitMinutes * 60_000).toISOString(),
    })
    .eq("id", job.id);
  console.warn(`[sync] job=${job.id} target=${job.target} status=failed attempts=${attempts}`);
}

/** Readable, short error for the admin sync page. */
export function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/\s+/g, " ").trim().slice(0, 500) || "Unknown error";
}
