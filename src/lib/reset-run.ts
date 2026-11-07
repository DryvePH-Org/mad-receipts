import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { resetInfo, type ResetKind } from "@/lib/reset";

type Admin = ReturnType<typeof createAdminClient>;
const ANY = "00000000-0000-0000-0000-000000000000";
const PROOFS = "payment-proofs";

export type ResetCounts = Record<string, number>;

/** How much there is of each thing, for the page. */
export async function countData(admin: Admin): Promise<ResetCounts> {
  const n = async (table: "deals" | "receipts" | "attachments" | "sync_jobs" | "audit_logs" | "unit_folders" | "folder_files") =>
    [table, (await admin.from(table).select("*", { count: "exact", head: true })).count ?? 0] as const;
  return Object.fromEntries(await Promise.all(["deals", "receipts", "attachments", "sync_jobs", "audit_logs", "unit_folders", "folder_files"].map((t) => n(t as Parameters<typeof n>[0]))));
}

async function wipe(admin: Admin, table: "deals" | "receipts" | "sync_jobs" | "audit_logs" | "folder_files", counts: ResetCounts): Promise<void> {
  const { count, error } = await admin.from(table).delete({ count: "exact" }).neq("id", ANY);
  if (error) throw new Error(`Could not delete ${table}: ${error.message}`);
  counts[table] = count ?? 0;
}

/** Every file in the proofs bucket: the top level holds one folder per user. */
async function emptyProofs(admin: Admin): Promise<number> {
  const bucket = admin.storage.from(PROOFS);
  let removed = 0;
  const top = (await bucket.list("", { limit: 1000 })).data ?? [];
  for (const entry of top) {
    if (entry.id) { await bucket.remove([entry.name]); removed++; continue; } // a file at the top
    for (;;) {
      const files = (await bucket.list(entry.name, { limit: 100 })).data ?? [];
      if (files.length === 0) break;
      const { error } = await bucket.remove(files.map((f) => `${entry.name}/${f.name}`));
      if (error) throw new Error(`Could not delete proof files: ${error.message}`);
      removed += files.length;
    }
  }
  return removed;
}

async function wipeTransactions(admin: Admin, counts: ResetCounts) {
  counts.proofFiles = await emptyProofs(admin);
  await wipe(admin, "sync_jobs", counts); // jobs point at receipts, so they go first
  await wipe(admin, "receipts", counts); // payments and attachments go with them
  await wipe(admin, "deals", counts); // units go with them; car folders just lose their deal link
  const { error } = await admin.rpc("reset_deal_numbers"); // D1001 again; skipped quietly if the latest database update is not applied
  counts.dealNumbersReset = error ? 0 : 1;
}

async function wipeDocuments(admin: Admin, counts: ResetCounts) {
  await wipe(admin, "folder_files", counts);
  const { count, error } = await admin.from("unit_folders").delete({ count: "exact" }).neq("plate_no", "");
  if (error) throw new Error(`Could not delete unit_folders: ${error.message}`);
  counts.unit_folders = count ?? 0;
}

/** Does one reset. The caller has already checked the Admin and the typed words. */
export async function runReset(admin: Admin, kind: ResetKind, actorId: string): Promise<ResetCounts> {
  if (!resetInfo(kind)) throw new Error("Unknown reset");
  const counts: ResetCounts = {};
  if (kind === "transactions" || kind === "everything") await wipeTransactions(admin, counts);
  if (kind === "sync") await wipe(admin, "sync_jobs", counts);
  if (kind === "documents" || kind === "everything") await wipeDocuments(admin, counts);
  if (kind === "activity" || kind === "everything") await wipe(admin, "audit_logs", counts); // last, so the line below is the only one left
  await admin.from("audit_logs").insert({ actor_id: actorId, action: "data.reset", entity: "data", entity_id: null, after: { kind, counts } });
  return counts;
}
