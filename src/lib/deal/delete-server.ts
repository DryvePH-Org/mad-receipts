import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appsScriptCall, appsScriptConfigured } from "@/lib/google/apps-script";
import { docsBridge } from "@/lib/docs/bridge";
import { receiptFileBase } from "@/lib/docs/receipt-names";
import { createAdminClient } from "@/lib/supabase/admin";

export interface DeleteSummary { dealNo: string; buyer: string; receipts: number; plates: string[]; driveTrashed: number; storageRemoved: number; warnings: string[] }
export type DeleteResult = { ok: true; summary: DeleteSummary } | { ok: false; message: string };

type Db = SupabaseClient; // the delete_deal function is newer than the generated types

/** What an Admin is about to delete, for the confirmation box. */
export async function previewDelete(dealId: string): Promise<{ dealNo: string; buyer: string; receipts: number; proofs: number; plates: string[] } | null> {
  const db = createAdminClient() as unknown as Db;
  const { data: deal } = await db.from("deals").select("deal_no, buyer_name").eq("id", dealId).maybeSingle();
  if (!deal) return null;
  const [{ data: receipts }, { data: units }] = await Promise.all([
    db.from("receipts").select("id").eq("deal_id", dealId),
    db.from("deal_units").select("plate_no").eq("deal_id", dealId),
  ]);
  const ids = (receipts ?? []).map((r: { id: string }) => r.id);
  const proofs = ids.length ? (await db.from("attachments").select("id", { count: "exact", head: true }).in("receipt_id", ids)).count ?? 0 : 0;
  return { dealNo: deal.deal_no as string, buyer: deal.buyer_name as string, receipts: ids.length, proofs, plates: (units ?? []).map((u: { plate_no: string }) => u.plate_no) };
}

/**
 * Deletes a transaction and everything that hangs on it. The database part is one step that cannot half-happen (the receipts, their payments and
 * proof records, the units, the jobs). Then the files go: the proof photos in storage, the audit copies in the receipts folder in Drive, and in the
 * car's own folder the AR copies the app saved (and the signed AR paper: a photo that is only an AR). Other papers in the car's folder, like the
 * buyer's ID and the deed, are never touched. Drive files go to the Drive trash (30 days). The car goes back to Onhand when the deal was why it was
 * Reserved or Sold. A failure in the file part is reported in `warnings`; the transaction is deleted either way.
 */
export async function deleteTransaction(dealId: string, actorId: string, typedDealNo: string): Promise<DeleteResult> {
  const admin = createAdminClient();
  const db = admin as unknown as Db;
  const preview = await previewDelete(dealId);
  if (!preview) return { ok: false, message: "That transaction was not found." };
  if (typedDealNo.trim().toUpperCase() !== preview.dealNo.toUpperCase()) return { ok: false, message: `Type the deal number (${preview.dealNo}) to confirm.` };

  // what is in the car folders now (read before the rows are gone)
  const { data: receiptRows } = await db.from("receipts").select("receipt_no").eq("deal_id", dealId);
  const receiptNos = (receiptRows ?? []).map((r: { receipt_no: string }) => r.receipt_no);
  const carFiles: { plate: string; driveId: string; fileRowId: string | null }[] = [];
  const warnings: string[] = [];
  try {
    const bridge = docsBridge();
    for (const plate of preview.plates) {
      const { data: folder } = await db.from("unit_folders").select("folder_id").eq("plate_no", plate).maybeSingle();
      if (!folder?.folder_id) continue;
      const names = receiptNos.map((no) => receiptFileBase(no, plate).toUpperCase());
      const listing = await bridge.listFiles(folder.folder_id as string);
      const { data: rows } = await db.from("folder_files").select("id, drive_file_id, doc_types").eq("plate_no", plate);
      const signedAr = new Set((rows ?? []).filter((f: { doc_types: string[] | null }) => Array.isArray(f.doc_types) && f.doc_types.length === 1 && f.doc_types[0] === "acknowledgement_receipt").map((f: { drive_file_id: string }) => f.drive_file_id));
      for (const f of listing.files) {
        const isAppCopy = names.some((base) => f.name.toUpperCase().startsWith(base));
        if (isAppCopy || signedAr.has(f.id)) carFiles.push({ plate, driveId: f.id, fileRowId: (rows ?? []).find((x: { drive_file_id: string }) => x.drive_file_id === f.id)?.id ?? null });
      }
    }
  } catch (e) { warnings.push(`The car folder could not be read, so its AR copies were left: ${e instanceof Error ? e.message : "unknown"}`); }

  const { data, error } = await db.rpc("delete_deal", { p_actor: actorId, p_deal_id: dealId });
  if (error) return { ok: false, message: /not_admin/.test(error.message) ? "Only an Admin can delete a transaction." : `Could not delete it: ${error.message.slice(0, 160)}` };
  const out = data as { deal_no: string; buyer: string; storage_paths: string[]; audit_folders: string[]; plates: string[]; receipt_nos: string[] };

  let storageRemoved = 0, driveTrashed = 0;
  if (out.storage_paths.length) {
    const r = await admin.storage.from("payment-proofs").remove(out.storage_paths);
    if (r.error) warnings.push(`The proof photos could not all be removed from storage: ${r.error.message}`); else storageRemoved = out.storage_paths.length;
  }
  if (appsScriptConfigured() && process.env.DOCS_MOCK !== "1") {
    for (const id of out.audit_folders) {
      try { await appsScriptCall("receipts.trash", { folderId: id }); driveTrashed++; } catch (e) { warnings.push(`An audit copy in Drive could not be trashed: ${e instanceof Error ? e.message : "unknown"}`); }
    }
  }
  for (const f of carFiles) {
    try { await docsBridge().trashFile(f.driveId); driveTrashed++; if (f.fileRowId) await db.from("folder_files").delete().eq("id", f.fileRowId); }
    catch (e) { warnings.push(`A file in the car's folder could not be trashed: ${e instanceof Error ? e.message : "unknown"}`); }
  }
  // the car goes back to Onhand unless another live deal still holds it
  for (const plate of out.plates) {
    const { data: live } = await db.from("deal_units").select("deal_id").eq("plate_no", plate).eq("active", true).limit(1);
    if (live?.length) continue;
    await db.from("docs_units").update({ stock_state: "Onhand", state_for: null, state_on: null, last_change_source: "deal deleted" }).eq("plate_no", plate).is("archived_at", null).in("stock_state", ["Reserved", "Sold"]);
  }
  return { ok: true, summary: { dealNo: out.deal_no, buyer: out.buyer, receipts: out.receipt_nos.length, plates: out.plates, driveTrashed, storageRemoved, warnings } };
}
