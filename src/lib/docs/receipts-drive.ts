import "server-only";
import { getSettings } from "@/lib/data";
import type { FormState } from "@/lib/deal/types";
import { normalizePlate } from "@/lib/rules/plate";
import { createAdminClient } from "@/lib/supabase/admin";
import { docsBridge } from "./bridge";
import { receiptFileBase } from "./receipt-names";
import { receiptRecordHtml } from "./receipt-record";

// Putting a car's approved receipts into its Drive folder is a button for the Documentation role (it no longer happens by itself).


const esc = (t: unknown) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

export interface CarReceipt { id: string; receiptNo: string; filed: boolean }

async function approvedReceipts(plate: string) {
  const admin = createAdminClient();
  const key = normalizePlate(plate);
  const { data: folder } = await admin.from("unit_folders").select("deal_id, folder_id").eq("plate_no", key).maybeSingle();
  if (!folder?.deal_id) return { folder, receipts: [] as { id: string; receipt_no: string; receipt_date: string; amount: number | string; snapshot: unknown }[] };
  const { data } = await admin.from("receipts").select("id, receipt_no, receipt_date, amount, snapshot").eq("deal_id", folder.deal_id).eq("status", "approved").order("created_at");
  return { folder, receipts: data ?? [] };
}

/** The car's approved receipts, and whether each one is already in the folder (read from the folder's own list of files). */
export async function listCarReceipts(plate: string): Promise<CarReceipt[]> {
  const { folder, receipts } = await approvedReceipts(plate);
  if (!receipts.length) return [];
  let names = new Set<string>();
  if (folder?.folder_id) { try { names = new Set((await docsBridge().listFiles(folder.folder_id)).files.map((f) => f.name)); } catch { /* unknown: shown as not filed */ } }
  return receipts.map((r) => ({ id: r.id, receiptNo: r.receipt_no, filed: names.has(`${receiptFileBase(r.receipt_no, plate)}.html`) }));
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
    if (have.has(`${base}.html`)) { skipped++; continue; }
    // a receipt saved without its form (an old or hand-made one) gets a short plain record instead of a failure
    const full = !!r.snapshot && typeof r.snapshot === "object" && Array.isArray((r.snapshot as { units?: unknown }).units);
    const html = new TextEncoder().encode(full ? receiptRecordHtml(r.snapshot as unknown as FormState, company) : `<!doctype html><html lang="en"><meta charset="utf-8"><title>Receipt ${esc(r.receipt_no)}</title><body style="font:14px system-ui;max-width:640px;margin:24px auto"><h1>${esc(company.name)}</h1><p>Receipt No. <b>${esc(r.receipt_no)}</b> · ${esc(r.receipt_date)} · amount received ${esc(r.amount)}</p><p>The full record of this receipt is in the app.</p></body></html>`);
    await bridge.upload(folder.folder_id, `${base}.html`, html, "text/html");
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
