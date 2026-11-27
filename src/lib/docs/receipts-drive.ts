import "server-only";
import { getSettings } from "@/lib/data";
import { normalizePlate } from "@/lib/rules/plate";
import { createAdminClient } from "@/lib/supabase/admin";
import { docsBridge } from "./bridge";
import { receiptCopyName, receiptCopyNames, receiptFileBase } from "./receipt-names";
import { receiptPageHtml, UNSIGNED_BANNER } from "./receipt-record";

// Putting a car's approved receipts into its Drive folder is a button for the Documentation role (it no longer happens by itself).
// The copy is named ..._UNSIGNED: it is the app's own printout; the signed paper is photographed and uploaded separately.



export interface CarReceipt { id: string; receiptNo: string; filed: boolean; copyName: string }

async function approvedReceipts(plate: string) {
  const admin = createAdminClient();
  const key = normalizePlate(plate);
  const { data: folder } = await admin.from("unit_folders").select("deal_id, folder_id").eq("plate_no", key).maybeSingle();
  if (!folder?.deal_id) return { folder, receipts: [] as { id: string; receipt_no: string; receipt_date: string; amount: number | string; snapshot: unknown }[] };
  const { data } = await admin.from("receipts").select("id, receipt_no, receipt_date, amount, snapshot").eq("deal_id", folder.deal_id).eq("status", "approved").order("created_at");
  return { folder, receipts: data ?? [] };
}

/**
 * The car's approved receipts, and whether each one is already in the folder. Reading the folder's own list of files goes to Google (one to three seconds), so it is
 * done only when the Receipts tab is open (`checkDrive`); otherwise the receipts are listed from the database alone (`filed` is not known then).
 */
export async function listCarReceipts(plate: string, opts: { checkDrive?: boolean } = {}): Promise<CarReceipt[]> {
  const { folder, receipts } = await approvedReceipts(plate);
  if (!receipts.length) return [];
  let names = new Set<string>();
  if (opts.checkDrive && folder?.folder_id) { try { names = new Set((await docsBridge().listFiles(folder.folder_id)).files.map((f) => f.name)); } catch { /* unknown: shown as not filed */ } }
  return receipts.map((r) => ({ id: r.id, receiptNo: r.receipt_no, filed: receiptCopyNames(r.receipt_no, plate).some((n) => names.has(n)), copyName: receiptCopyName(r.receipt_no, plate) }));
}

/** Puts every approved receipt that is not in the folder yet there: the receipt as a printable page, and its proofs. Safe to repeat. */
export async function fileCarReceipts(plate: string): Promise<{ filed: number; skipped: number }> {
  const admin = createAdminClient();
  const { folder, receipts } = await approvedReceipts(plate);
  if (!folder?.folder_id) throw new Error("This car has no folder in Drive yet.");
  if (!receipts.length) throw new Error("This car has no approved receipt yet.");
  const bridge = docsBridge();
  const have = new Set((await bridge.listFiles(folder.folder_id)).files.map((f) => f.name));
  const company = (await getSettings()).company;
  let filed = 0, skipped = 0;
  for (const r of receipts) {
    const base = receiptFileBase(r.receipt_no, plate);
    if (receiptCopyNames(r.receipt_no, plate).some((n) => have.has(n))) { skipped++; continue; }
    const html = new TextEncoder().encode(receiptPageHtml({ receiptNo: r.receipt_no, receiptDate: r.receipt_date, amount: r.amount, snapshot: r.snapshot }, company, UNSIGNED_BANNER));
    await bridge.upload(folder.folder_id, receiptCopyName(r.receipt_no, plate), html, "text/html");
    const { data: files } = await admin.from("attachments").select("storage_path, filename, mime_type").eq("receipt_id", r.id).order("created_at");
    let n = 0;
    for (const f of files ?? []) {
      const name = `${base}_proof-${++n}.${f.filename.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg"}`;
      if (have.has(name)) continue;
      const blob = await admin.storage.from("payment-proofs").download(f.storage_path);
      if (blob.error) throw new Error(`Could not read a proof file: ${blob.error.message}`);
      await bridge.upload(folder.folder_id, name, new Uint8Array(await blob.data.arrayBuffer()), f.mime_type ?? "image/jpeg");
    }
    filed++;
  }
  return { filed, skipped };
}

/** The cars of a deal (by their folders) so the button can sit on the deal page: each plate's approved receipts are filed. */
export async function fileDealReceipts(dealId: string): Promise<{ plates: string[]; filed: number; skipped: number }> {
  const { data: folders } = await createAdminClient().from("unit_folders").select("plate_no, folder_id").eq("deal_id", dealId);
  const linked = (folders ?? []).filter((f) => f.folder_id);
  if (!linked.length) throw new Error("This deal's car has no folder in Drive yet. Link the folder in Car documents first.");
  let filed = 0, skipped = 0;
  for (const f of linked) { const r = await fileCarReceipts(f.plate_no as string); filed += r.filed; skipped += r.skipped; }
  return { plates: linked.map((f) => f.plate_no as string), filed, skipped };
}
