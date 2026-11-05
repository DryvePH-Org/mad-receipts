import "server-only";
import { linkFolder } from "@/lib/docs/service";
import { createDriveClient } from "@/lib/google/drive";
import { createSheetsClient } from "@/lib/google/sheets";
import { inventory } from "@/lib/inventory";
import { manilaToday } from "@/lib/dates";
import { parseSettings } from "@/lib/deal/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";
import { createTelegramClient } from "@/lib/telegram";
import { syncTargets, TARGET_ORDER, type ProofBytes, type SyncContext, type SyncDeps, type SyncEvent, type SyncTarget } from "./targets";

/** Wait before the next try, by failed attempts so far. */
export const BACKOFF_MINUTES = [1, 5, 15, 60, 360];
export const MAX_ATTEMPTS = 5;

type Job = Tables<"sync_jobs">;
type Admin = ReturnType<typeof createAdminClient>;

export interface SyncRunSummary { claimed: number; done: number; failed: number }

function memo<T>(make: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= make());
}

/** Real clients, created on first use so one missing config only fails its own target. */
export function defaultSyncDeps(): SyncDeps {
  return {
    sheets: memo(createSheetsClient), drive: memo(createDriveClient), telegram: memo(createTelegramClient), inventory,
    config: { driveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID, logSheetId: process.env.GOOGLE_SHEET_ID },
    docsLink: (plate, dealId) => linkFolder(plate, dealId),
  };
}

/**
 * Runs due sync jobs (pending or failed, next_run_at reached, fewer than 5 attempts).
 * A failure never touches the saved receipt: the job records the error and retries later.
 */
export async function processDueJobs(options: { receiptId?: string; limit?: number; deps?: SyncDeps; admin?: Admin } = {}): Promise<SyncRunSummary> {
  const admin = options.admin ?? createAdminClient();
  const deps = options.deps ?? defaultSyncDeps();

  const { data: jobs, error } = await admin.rpc("claim_sync_jobs", { p_limit: options.limit ?? 20, p_receipt_id: options.receiptId });
  if (error) throw new Error(`Could not claim sync jobs: ${error.message}`);

  const summary: SyncRunSummary = { claimed: jobs.length, done: 0, failed: 0 };
  const byReceipt = new Map<string, Job[]>();
  for (const job of jobs) byReceipt.set(job.receipt_id, [...(byReceipt.get(job.receipt_id) ?? []), job]);

  for (const [receiptId, receiptJobs] of byReceipt) {
    receiptJobs.sort((a, b) => TARGET_ORDER.indexOf(a.target as SyncTarget) - TARGET_ORDER.indexOf(b.target as SyncTarget));
    let ctx: Omit<SyncContext, "event">;
    try {
      ctx = await loadContext(admin, receiptId);
    } catch (err) {
      for (const job of receiptJobs) await markFailed(admin, job, err);
      summary.failed += receiptJobs.length;
      continue;
    }
    for (const job of receiptJobs) {
      try {
        const result = await syncTargets[job.target as SyncTarget]({ ...ctx, event: job.event as SyncEvent }, deps);
        if (result?.driveFileId) {
          const { error: saveError } = await admin.from("receipts").update({ drive_file_id: result.driveFileId }).eq("id", receiptId);
          if (saveError) throw new Error(`Filed, but could not save the Drive file id: ${saveError.message}`);
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

async function loadContext(admin: Admin, receiptId: string): Promise<Omit<SyncContext, "event">> {
  const { data: receipt, error } = await admin.from("receipts").select("*").eq("id", receiptId).single();
  if (error || !receipt) throw new Error(`Could not load the receipt: ${error?.message ?? "not found"}`);
  const [{ data: deal }, { data: units }, { data: payments }, { data: last }, { data: settingsRow }] = await Promise.all([
    admin.from("deal_summaries").select("*").eq("id", receipt.deal_id).single(),
    admin.from("deal_units").select("make_type, plate_display, plate_no, color").eq("deal_id", receipt.deal_id).order("position"),
    admin.from("receipt_payments").select("*").eq("receipt_id", receiptId).order("position"),
    admin.from("receipts").select("receipt_no, created_at").eq("deal_id", receipt.deal_id).eq("status", "approved").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("app_settings").select("config").eq("id", 1).maybeSingle(),
  ]);
  if (!deal) throw new Error("Could not load the deal");
  const ids = [receipt.submitted_by, receipt.reviewed_by, deal.created_by].filter((x): x is string => !!x);
  const { data: people } = await admin.from("profiles").select("id, full_name").in("id", ids);
  const name = (id: string | null) => (people ?? []).find((p) => p.id === id)?.full_name ?? "";
  let proofs: Promise<ProofBytes[]> | undefined;

  return {
    receipt, deal, units: (units ?? []).map((u) => ({ make_type: u.make_type, plate: u.plate_display, plate_no: u.plate_no, color: u.color })), payments: payments ?? [],
    settings: parseSettings(settingsRow?.config), filledInBy: name(receipt.submitted_by), approvedBy: name(receipt.reviewed_by), salesperson: name(deal.created_by),
    lastReceiptNo: last?.receipt_no ?? receipt.receipt_no, lastReceiptAt: last?.created_at ?? receipt.created_at, today: manilaToday(),
    proofs: () => (proofs ??= (async () => {
      const { data: files } = await admin.from("attachments").select("storage_path, filename, mime_type").eq("receipt_id", receiptId).order("created_at");
      const out: ProofBytes[] = [];
      for (const f of files ?? []) {
        const file = await admin.storage.from("payment-proofs").download(f.storage_path);
        if (file.error) throw new Error(`Could not read a proof file: ${file.error.message}`);
        out.push({ name: f.filename, mime: f.mime_type ?? "image/jpeg", bytes: new Uint8Array(await file.data.arrayBuffer()) });
      }
      return out;
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
  await admin.from("sync_jobs").update({ status: "failed", attempts, last_error: errorText(err), next_run_at: new Date(Date.now() + waitMinutes * 60_000).toISOString() }).eq("id", job.id);
  console.warn(`[sync] job=${job.id} target=${job.target} status=failed attempts=${attempts}`);
}

/** Readable, short error for the admin sync page. */
export function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/\s+/g, " ").trim().slice(0, 500) || "Unknown error";
}
