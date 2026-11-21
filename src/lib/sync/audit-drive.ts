import "server-only";
import { appsScriptCall, appsScriptConfigured } from "@/lib/google/apps-script";
import { AUDIT_BANNER, receiptPageHtml } from "@/lib/docs/receipt-record";
import { receiptFileBase } from "@/lib/docs/receipt-names";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SyncContext } from "./targets";

/**
 * The audit copy: when a receipt is saved, its printout and its proof photos are put in the receipts folder in Drive (one folder per receipt, inside a
 * folder for its month), so there is a copy outside the app. The folder's id is kept on the receipt, which is also how it is trashed when an Admin
 * deletes the transaction. Safe to run again. Without the Google bridge (development, the browser tests) it does nothing.
 */
export async function saveAuditCopy(ctx: SyncContext): Promise<void> {
  if (!appsScriptConfigured() || process.env.DOCS_MOCK === "1") return;
  if (ctx.receipt.drive_file_id) return; // already saved
  const plate = ctx.units[0]?.plate_no ?? "NOPLATE";
  const base = receiptFileBase(ctx.receipt.receipt_no, plate);
  const month = String(ctx.receipt.receipt_date).slice(0, 7);
  const html = receiptPageHtml({ receiptNo: ctx.receipt.receipt_no, receiptDate: ctx.receipt.receipt_date, amount: ctx.receipt.amount, snapshot: ctx.receipt.snapshot }, ctx.settings.company, AUDIT_BANNER);
  const send = (file: { name: string; mimeType: string; bytes: Uint8Array }) =>
    appsScriptCall<{ id: string }>("receipts.save", { month, name: base, files: [{ name: file.name, mimeType: file.mimeType, base64: Buffer.from(file.bytes).toString("base64") }] });
  const saved = await send({ name: `${base}.html`, mimeType: "text/html", bytes: new TextEncoder().encode(html) });
  let n = 0;
  for (const proof of await ctx.proofs()) {
    const ext = proof.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    await send({ name: `${base}_proof-${++n}.${ext}`, mimeType: proof.mime, bytes: proof.bytes });
  }
  await createAdminClient().from("receipts").update({ drive_file_id: saved.id }).eq("id", ctx.receipt.id);
}
