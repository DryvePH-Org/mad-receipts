import "server-only";
import { normalizePlate } from "@/lib/rules/plate";
import { cleanAmount, isPaymentStatus, isPaymentTag, PAYMENT_LABEL, type PaymentStatus } from "./payments";
import { isTransferTag } from "./transfer-papers";
import { defaultDocsDeps, docsErrorText, type DocsDeps } from "./service";

// The payment archive of a car: photos or PDFs of the payment papers, kept in the car's Drive folder next to its other papers. The scanner never
// reads them and they are not on the checklist (folder_files.archive marks them). One payment status sits on the car's sale record.

const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null);
const safe = (s: string) => s.replace(/\.[A-Za-z0-9]{2,5}$/, "").replace(/[^\w -]+/g, "").replace(/\s+/g, "_").slice(0, 40) || "payment";
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

const logCar = async (deps: Pick<DocsDeps, "admin">, actor: string, action: string, plate: string, after: object) => { await deps.admin.from("audit_logs").insert({ actor_id: actor, action, entity: "unit_folder", entity_id: null, after: { plate, ...after } as never }); };

export type ArchiveKind = "payment" | "transfer";
export interface ArchiveInput { plate: string; actor: string; bytes: Uint8Array; mime: string; name: string; tag: string; /** payment papers (default) or the papers handed to the new owner */ kind?: ArchiveKind; amount?: unknown; on?: unknown; note?: unknown }

/** One paper into the car's folder and the archive: a payment paper, or a paper handed to the new owner (kind "transfer"). The car must have its folder linked (the papers live there). */
export async function uploadArchive(input: ArchiveInput, deps: DocsDeps = defaultDocsDeps()): Promise<{ id: string; filename: string }> {
  const key = normalizePlate(input.plate);
  const { data: folder } = await deps.admin.from("unit_folders").select("folder_id, match_status").eq("plate_no", key).maybeSingle();
  if (!folder?.folder_id || folder.match_status !== "linked") throw new Error("This car has no document folder linked yet. Link its folder in Documents first.");
  const kind: ArchiveKind = input.kind === "transfer" ? "transfer" : "payment";
  const tag = kind === "transfer" ? (isTransferTag(input.tag) ? input.tag : "Other") : isPaymentTag(input.tag) ? input.tag : "Other";
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const filename = `${kind === "transfer" ? "NEWOWNER" : "PAY"}_${stamp}_${safe(tag)}_${safe(input.name)}.${EXT[input.mime] ?? "jpg"}`;
  const uploaded = await deps.bridge.upload(folder.folder_id, filename, input.bytes, input.mime);
  const row = {
    plate_no: key, drive_file_id: uploaded.id, filename, mime_type: input.mime, size_bytes: input.bytes.length, drive_url: uploaded.url, source: "upload", uploaded_by: input.actor,
    read_status: "done", doc_types: [] as string[], archive: kind, archive_tag: tag, archive_amount: cleanAmount(input.amount), archive_on: day(input.on),
    archive_note: typeof input.note === "string" ? input.note.trim().slice(0, 300) || null : null,
  };
  const saved = await deps.admin.from("folder_files").insert(row).select("id").single();
  if (saved.error || !saved.data) throw new Error(`Uploaded, but could not record the file: ${saved.error?.message ?? "unknown"}`);
  await logCar(deps, input.actor, kind === "transfer" ? "docs.transfer_paper_add" : "docs.archive_add", key, { file: filename, tag });
  return { id: saved.data.id, filename };
}

/** An Admin removes a paper of the archive (a payment paper or a paper of the new owner): it goes to the Drive trash (kept 30 days there) and leaves the archive. */
export async function deleteArchiveFile(fileId: string, actor: string, deps: DocsDeps = defaultDocsDeps()): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: file } = await deps.admin.from("folder_files").select("id, plate_no, filename, drive_file_id, archive, archive_tag").eq("id", fileId).maybeSingle();
  if (!file || !file.archive) return { ok: false, message: "That paper was not found." };
  try { await deps.bridge.trashFile(file.drive_file_id); } catch (e) { return { ok: false, message: docsErrorText(e) }; }
  const { error } = await deps.admin.from("folder_files").delete().eq("id", fileId);
  if (!error) await logCar(deps, actor, file.archive === "transfer" ? "docs.transfer_paper_remove" : "docs.archive_remove", (file as { plate_no?: string }).plate_no ?? "", { file: (file as { filename?: string }).filename, tag: (file as { archive_tag?: string }).archive_tag ?? "" });
  return error ? { ok: false, message: error.message } : { ok: true };
}

/** The payment status of the car's sale record, set by a person. */
export async function setPaymentStatus(plate: string, status: PaymentStatus | null, actor: string, deps: Pick<DocsDeps, "admin"> = defaultDocsDeps()): Promise<{ ok: true } | { ok: false; message: string }> {
  if (status !== null && !isPaymentStatus(status)) return { ok: false, message: "That status is not one of the choices." };
  const key = normalizePlate(plate);
  const { saleOfPlate } = await import("./service");
  const sale = await saleOfPlate(deps.admin, key);
  if (!sale) return { ok: false, message: "This car has no sale recorded yet. Add the sale first." };
  const db = deps.admin as unknown as { from: (t: string) => { update: (v: object) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> } } };
  const { error } = await db.from("car_sales").update({ payment_status: status, payment_status_at: new Date().toISOString(), updated_by: actor, updated_at: new Date().toISOString() }).eq("id", sale.id);
  if (!error) await logCar(deps, actor, "docs.payment_status", key, { status: status ? PAYMENT_LABEL[status] : "" });
  return error ? { ok: false, message: error.message } : { ok: true };
}
