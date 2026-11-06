import { driveConfigured, driveSafeName, uploadToDrive } from "@/lib/pcf/google-drive";
import { createAdminClient } from "@/lib/supabase/admin";

export type MirrorKind = "receipt" | "paper";

// Copies a voucher's photo from private storage to Google Drive and remembers
// the link. Runs in the background after the voucher action has answered, so
// a Drive outage never blocks cash handling; failures are only logged.
export async function mirrorVoucherPhoto(voucherId: string, kind: MirrorKind) {
  if (!driveConfigured()) return;

  const admin = createAdminClient();
  const { data: voucher } = await admin
    .from("vouchers")
    .select("pcv_number, voucher_date, fund_id, receipt_path, paper_voucher_path")
    .eq("id", voucherId)
    .maybeSingle();
  const path = kind === "paper" ? voucher?.paper_voucher_path : voucher?.receipt_path;
  if (!voucher || !path) return;

  const [{ data: fund }, { data: blob, error }] = await Promise.all([
    admin.from("funds").select("name").eq("id", voucher.fund_id).maybeSingle(),
    admin.storage.from("receipts").download(path),
  ]);
  if (error || !blob) throw error ?? new Error("Photo not found in storage");

  const stamp = new Date().toISOString().slice(0, 10);
  const uploaded = await uploadToDrive({
    folders: [fund?.name ?? "Fund", voucher.voucher_date.slice(0, 7)],
    fileName: `${driveSafeName(voucher.pcv_number)}-${kind === "paper" ? "paper-voucher" : "receipt"}-${stamp}.jpg`,
    mimeType: blob.type || "image/jpeg",
    bytes: await blob.arrayBuffer(),
  });

  await admin
    .from("vouchers")
    .update(
      kind === "paper"
        ? { paper_drive_url: uploaded.url }
        : { receipt_drive_url: uploaded.url },
    )
    .eq("id", voucherId);
}
