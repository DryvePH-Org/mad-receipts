"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireModule, requireAdmin } from "@/lib/auth";
import { removeFile, resetFile, editReading, reviewFlag, chooseFolder, defaultDocsDeps, docsErrorText, linkFolder, previewCarFolder, type FolderPreview, moveToSold, readPending, refreshFolders, scanFolder, setCase, setFileTypes, type MoveResult, type ReadProgress } from "@/lib/docs/service";
import { CASES, CHOOSABLE, type CaseType, type DocType } from "@/lib/docs/types";
import { readerMode, scheduleScan } from "@/lib/docs/bot-scan";
import { allowed } from "@/lib/docs/stage";
import { stageFor } from "@/lib/docs/stage-server";
import { fileCarReceipts, fileDealReceipts } from "@/lib/docs/receipts-drive";
import { carAdded } from "@/lib/notify/events";
import { unitForFolder } from "@/lib/docsbible/unit-lookup";
import { removeUnit } from "@/lib/docsbible/remove-unit-server";
import { addUnit, unitStatus, type AddUnitResult, type UnitStatus } from "@/lib/docsbible/add-unit-server";
import { markRegisterSold, recordHandoff, setRegisterClassification, syncRegister } from "@/lib/docsbible/sync";
import { adminFix, afterReading, approveUnit, handoffUnit, returnUnit, saveDetails, setHandoffChecked, type StepResult } from "@/lib/docs/workflow";
import { normalizePlate } from "@/lib/rules/plate";
import { createAdminClient } from "@/lib/supabase/admin";

export type Done = { ok: true; message: string } | { ok: false; message: string };
const plateSchema = z.string().min(5).max(20);

/** The rules for this car right now. The server enforces them, so pressing a button out of order never works, whatever the page showed. */
async function rulesFor(plate: string) {
  const stage = await stageFor(plate);
  if (!stage) throw new Error("This car is not in Car documents.");
  return stage.rules;
}

async function guard<T>(fn: () => Promise<T>, fail: (message: string) => T): Promise<T> {
  try { return await fn(); } catch (err) {
    if (typeof err === "object" && err && "digest" in err) throw err; // redirects and 403s from requireRole
    return fail(docsErrorText(err));
  }
}

/** Reads the Available and Sold folders so every car has a row. */
export async function refreshFoldersAction(): Promise<Done> {
  await requireModule("documents");
  return guard<Done>(async () => {
    const r = await refreshFolders();
    revalidatePath("/documents");
    return { ok: true as const, message: `${r.folders} car folders found${r.duplicates ? `, ${r.duplicates} plate${r.duplicates === 1 ? "" : "s"} with more than one folder` : ""}${r.skipped ? `, ${r.skipped} folder${r.skipped === 1 ? "" : "s"} without a plate in the name skipped` : ""}.` };
  }, (message) => ({ ok: false as const, message }));
}

/** Looks at the folder's files again (new photos added in Drive show up and wait to be read). */
export async function rescanAction(plate: string): Promise<Done> {
  await requireModule("documents");
  const p = plateSchema.safeParse(plate);
  if (!p.success) return { ok: false, message: "Bad plate." };
  return guard<Done>(async () => {
    const { added, removed } = await scanFolder(p.data);
    revalidatePath(`/documents/${normalizePlate(p.data)}`);
    const said = [added ? `${added} new file${added === 1 ? "" : "s"} found` : "", removed ? `${removed} file${removed === 1 ? "" : "s"} no longer in the folder, removed from the list` : ""].filter(Boolean).join("; ");
    return { ok: true as const, message: said ? `${said}.` : "The folder has not changed." };
  }, (message) => ({ ok: false as const, message }));
}

/**
 * A quiet look at the car's Drive folder, asked by the car page every minute or so while it is open (no message): new photos put straight into
 * the folder are listed and sent to the scanner, and photos taken out of the folder disappear from the page. Returns whether anything changed.
 */
export async function syncFolderAction(plate: string): Promise<{ changed: boolean }> {
  await requireModule("documents");
  const p = plateSchema.safeParse(plate);
  if (!p.success) return { changed: false };
  try {
    const { added, removed } = await scanFolder(p.data);
    if (added > 0 && readerMode() === "grokbot") scheduleScan(normalizePlate(p.data), 20_000);
    if (added || removed) revalidatePath(`/documents/${normalizePlate(p.data)}`);
    return { changed: added + removed > 0 };
  } catch { return { changed: false }; }
}

/** Reads the next couple of photos. The page calls this again until nothing is waiting. */
export async function readNextAction(plate: string, retryFailed = false): Promise<ReadProgress> {
  await requireModule("documents");
  const p = plateSchema.safeParse(plate);
  if (!p.success) return { read: 0, remaining: 0, waitSeconds: null, error: "Bad plate." };
  return guard<ReadProgress>(async () => {
    const rule = (await rulesFor(p.data)).scan;
    if (!rule.allowed) return { read: 0, remaining: 0, waitSeconds: null, error: rule.reason };
    const r = await readPending(p.data, 3, defaultDocsDeps(), { retryFailed });
    revalidatePath(`/documents/${normalizePlate(p.data)}`);
    return r;
  }, (error) => ({ read: 0, remaining: 0, waitSeconds: null, error }));
}

export async function setFileTypesAction(fileId: string, types: string[] | null): Promise<Done> {
  const user = await requireModule("documents");
  const id = z.uuid().safeParse(fileId);
  if (!id.success) return { ok: false, message: "Bad file." };
  const chosen = types ? types.filter((t): t is DocType => (CHOOSABLE as string[]).includes(t)) : null;
  if (types && chosen && chosen.length === 0) return { ok: false, message: "Choose at least one type." };
  return guard<Done>(async () => {
    await setFileTypes(id.data, chosen, user.id);
    revalidatePath("/documents", "layout");
    return { ok: true as const, message: chosen ? "Saved." : "Back to what was read." };
  }, (message) => ({ ok: false as const, message }));
}

const patchSchema = z.object({
  documentNumber: z.string().max(120).optional(), plate: z.string().max(120).optional(), motorNo: z.string().max(120).optional(), chassisNo: z.string().max(120).optional(),
  ownerName: z.string().max(120).optional(), holderName: z.string().max(120).optional(), sellerName: z.string().max(120).optional(), buyerName: z.string().max(120).optional(),
  secretaryName: z.string().max(120).optional(), representativeName: z.string().max(120).optional(), idType: z.string().max(120).optional(), validUntil: z.string().max(10).optional(), lender: z.string().max(120).optional(),
  copy: z.enum(["original", "photocopy"]).nullable().optional(), noDamage: z.boolean().optional(),
}).strict();

/** The staff correct what the bot read on one document of a photo. */
export async function editReadingAction(fileId: string, index: number, patch: unknown): Promise<Done> {
  const user = await requireModule("documents");
  const id = z.uuid().safeParse(fileId), p = patchSchema.safeParse(patch);
  if (!id.success || !p.success || !Number.isInteger(index) || index < 0 || index > 9) return { ok: false, message: "Bad request." };
  return guard<Done>(async () => {
    await editReading(id.data, index, p.data, user.id);
    revalidatePath("/documents", "layout");
    return { ok: true as const, message: "Saved. The warnings were checked again." };
  }, (message) => ({ ok: false as const, message }));
}

/** Read one photo again from scratch. */
export async function rescanFileAction(fileId: string): Promise<Done> {
  const user = await requireModule("documents");
  const id = z.uuid().safeParse(fileId);
  if (!id.success) return { ok: false, message: "Bad file." };
  return guard<Done>(async () => {
    const plate = await resetFile(id.data, user.id);
    revalidatePath("/documents", "layout");
    return { ok: true as const, message: `This photo is waiting to be scanned again (${plate}). Press Scan.` };
  }, (message) => ({ ok: false as const, message }));
}

/** Remove a photo from the car's folder (Drive trash, restorable for 30 days). Documentation and Admin work in this module; the server asks for the module again. */
export async function removeFileAction(fileId: string): Promise<Done> {
  const user = await requireModule("documents");
  const id = z.uuid().safeParse(fileId);
  if (!id.success) return { ok: false, message: "Bad file." };
  return guard<Done>(async () => {
    const r = await removeFile(id.data, user.id);
    revalidatePath("/documents", "layout");
    return { ok: true as const, message: `${r.name} was removed. It is in the Drive trash for 30 days.` };
  }, (message) => ({ ok: false as const, message }));
}

/** "Checked, this is fine" on a warning (or take it back). */
export async function reviewFlagAction(fileId: string, flag: string, accept: boolean): Promise<Done> {
  const user = await requireModule("documents");
  const id = z.uuid().safeParse(fileId);
  if (!id.success || typeof flag !== "string" || !flag || flag.length > 300) return { ok: false, message: "Bad request." };
  return guard<Done>(async () => {
    await reviewFlag(id.data, flag, !!accept, user.id);
    revalidatePath("/documents", "layout");
    return { ok: true as const, message: accept ? "Marked as checked." : "The warning is back." };
  }, (message) => ({ ok: false as const, message }));
}

export async function setCaseAction(plate: string, value: string): Promise<Done> {
  const user = await requireModule("documents");
  const p = plateSchema.safeParse(plate);
  if (!p.success) return { ok: false, message: "Bad plate." };
  const caseType = value === "auto" ? null : (CASES as readonly string[]).includes(value) ? (value as CaseType) : undefined;
  if (caseType === undefined) return { ok: false, message: "Unknown case." };
  return guard<Done>(async () => {
    await setCase(p.data, caseType, user.id);
    if (caseType) await setRegisterClassification(p.data, caseType, user.id).catch(() => undefined);
    revalidatePath("/documents", "layout");
    return { ok: true as const, message: "Saved." };
  }, (message) => ({ ok: false as const, message }));
}

/** Searches Drive for this plate's folder again. */
export async function relinkAction(plate: string): Promise<Done> {
  await requireModule("documents");
  const p = plateSchema.safeParse(plate);
  if (!p.success) return { ok: false, message: "Bad plate." };
  return guard<Done>(async () => {
    const key = normalizePlate(p.data);
    const { data: row } = await createAdminClient().from("unit_folders").select("plate_display, deal_id").eq("plate_no", key).maybeSingle();
    const result = await linkFolder(row?.plate_display ?? p.data, row?.deal_id ?? null);
    revalidatePath("/documents", "layout");
    return { ok: true as const, message: result === "linked" ? "Folder found and linked." : result === "none" ? "No folder with this plate yet." : "More than one folder matches. Choose the right one." };
  }, (message) => ({ ok: false as const, message }));
}

export async function chooseFolderAction(plate: string, folderId: string): Promise<Done> {
  await requireModule("documents");
  const p = plateSchema.safeParse(plate);
  if (!p.success || !folderId) return { ok: false, message: "Bad request." };
  return guard<Done>(async () => {
    await chooseFolder(p.data, folderId);
    revalidatePath("/documents", "layout");
    return { ok: true as const, message: "Folder linked." };
  }, (message) => ({ ok: false as const, message }));
}

export async function moveToSoldAction(plate: string, confirmIncomplete: boolean): Promise<MoveResult> {
  const user = await requireModule("documents");
  const p = plateSchema.safeParse(plate);
  if (!p.success) return { ok: false, error: "Bad plate." };
  return guard<MoveResult>(async () => {
    const rule = (await rulesFor(p.data)).moveToSold;
    if (!allowed(rule, user.role === "admin")) return { ok: false as const, error: rule.reason ?? "This car cannot be moved yet." };
    // an Admin going past a rule must say so: the confirmation lists what is open (the page asks for it)
    if (!rule.allowed && !confirmIncomplete) return { ok: false as const, needsConfirm: true as const, missing: [rule.reason ?? "Not ready"] };
    const r = await moveToSold(p.data, user.id, confirmIncomplete);
    if (r.ok) { await markRegisterSold(p.data, user.id).catch(() => undefined); revalidatePath("/documents", "layout"); }
    return r;
  }, (error) => ({ ok: false as const, error }));
}

// ---------------- details, approval and handoff ----------------

export type StepOutcome = { ok: true; message: string } | { ok: false; needsConfirm: true; missing: string[] } | { ok: false; message: string };
const outcome = (r: StepResult, message: string): StepOutcome => (r.ok ? { ok: true, message: r.notified === false ? `${message} Telegram could not be reached: tell marketing yourself.` : message } : "needsConfirm" in r ? r : { ok: false, message: r.error });

export async function saveDetailsAction(plate: string, data: unknown): Promise<Done> {
  const user = await requireModule("documents");
  const p = plateSchema.safeParse(plate);
  if (!p.success) return { ok: false, message: "Bad plate." };
  return guard<Done>(async () => {
    await saveDetails(p.data, data, user.id);
    revalidatePath(`/documents/${normalizePlate(p.data)}`);
    return { ok: true as const, message: "Details saved." };
  }, (message) => ({ ok: false as const, message }));
}

export async function approveUnitAction(plate: string, confirmIncomplete: boolean): Promise<StepOutcome> {
  const user = await requireModule("documents");
  const p = plateSchema.safeParse(plate);
  if (!p.success) return { ok: false, message: "Bad plate." };
  return guard<StepOutcome>(async () => {
    const rule = (await rulesFor(p.data)).approve;
    if (!rule.allowed) return { ok: false as const, message: rule.reason ?? "This cannot be approved yet." };
    const r = await approveUnit(p.data, user.id, confirmIncomplete);
    if (!r.ok) return outcome(r, "");
    const reg = await syncRegister(p.data, user.id).catch((e) => ({ ok: false as const, message: e instanceof Error ? e.message : "unknown" }));
    revalidatePath("/documents", "layout");
    return outcome(r, reg.ok ? "Approved. The car record is updated and marketing was told on Telegram." : `Approved and marketing was told, but the car record was not updated: ${reg.message} Press “Update the car record” on the car.`);
  }, (message) => ({ ok: false as const, message }));
}

export async function setHandoffCheckedAction(plate: string, keys: string[]): Promise<Done> {
  await requireModule("documents");
  const p = plateSchema.safeParse(plate);
  if (!p.success || !Array.isArray(keys)) return { ok: false, message: "Bad request." };
  return guard<Done>(async () => {
    await setHandoffChecked(p.data, keys);
    revalidatePath(`/documents/${normalizePlate(p.data)}`);
    return { ok: true as const, message: "Saved." };
  }, (message) => ({ ok: false as const, message }));
}

export async function handoffAction(plate: string, note: string, confirmIncomplete: boolean): Promise<StepOutcome> {
  const user = await requireModule("documents");
  const p = plateSchema.safeParse(plate);
  if (!p.success) return { ok: false, message: "Bad plate." };
  return guard<StepOutcome>(async () => {
    const rule = (await rulesFor(p.data)).handoff;
    if (!rule.allowed) return { ok: false as const, message: rule.reason ?? "This cannot be handed off yet." };
    const r = await handoffUnit(p.data, String(note ?? ""), user.id, confirmIncomplete);
    if (r.ok) { revalidatePath("/documents", "layout"); after(() => recordHandoff(p.data, "submitted", user.id).catch((e) => console.warn(`[docs] handoff record failed: ${e instanceof Error ? e.message : "unknown"}`))); }
    return outcome(r, "Handed off. You will be reminded every 3 days until it is marked as done.");
  }, (message) => ({ ok: false as const, message }));
}

export async function returnUnitAction(plate: string): Promise<Done> {
  const user = await requireModule("documents");
  const p = plateSchema.safeParse(plate);
  if (!p.success) return { ok: false, message: "Bad plate." };
  return guard<Done>(async () => {
    const rule = (await rulesFor(p.data)).markReturned;
    if (!rule.allowed) return { ok: false as const, message: rule.reason ?? "This cannot be marked as done." };
    const r = await returnUnit(p.data, user.id);
    if (!r.ok) return { ok: false as const, message: "error" in r ? r.error : "Could not do that." };
    revalidatePath("/documents", "layout");
    after(() => recordHandoff(p.data, "received", user.id).catch((e) => console.warn(`[docs] handoff record failed: ${e instanceof Error ? e.message : "unknown"}`)));
    return { ok: true as const, message: "Marked as done. No more reminders for this car." };
  }, (message) => ({ ok: false as const, message }));
}

// ---------------- adding documents by plate ----------------

/** What adding documents for this plate would do: an existing folder, or a new one named from the inventory. */
export async function previewAddAction(plate: string): Promise<FolderPreview> {
  await requireModule("documents");
  const p = z.string().min(1).max(20).safeParse(plate);
  if (!p.success) return { state: "invalid", message: "Type the plate number." };
  try { return await previewCarFolder(p.data, defaultDocsDeps(), unitForFolder); }
  catch (err) { return { state: "invalid", message: docsErrorText(err) }; }
}

/** Is this plate already in MAD? (Asked when the plate is checked on the Add a car page.) */
export async function unitStatusAction(plate: string): Promise<UnitStatus> {
  await requireModule("documents");
  const p = z.string().min(1).max(20).safeParse(plate);
  return p.success ? unitStatus(p.data) : { exists: false };
}

const detailsSchema = z.object({
  make: z.string().max(120), model_variant: z.string().max(160), year_model: z.string().max(10), color: z.string().max(120),
  body_type: z.string().max(60).optional(), trans: z.string().max(10).optional(), fuel: z.string().max(40).optional(), mileage: z.string().max(40).optional(), category: z.string().max(60).optional(),
  reg_owner_name: z.string().max(160).optional(), buying_source: z.string().max(40).optional(), spare_key: z.string().max(40).optional(), cs_no: z.string().max(40).optional(),
  mo_file: z.string().max(120).optional(), awarded_to: z.string().max(120).optional(), encumbrance: z.string().max(120).optional(), arrival_date: z.string().max(20).optional(),
}).strict();

/** The car's details are saved: a new car of the Docs Bible. Documentation and Admin. */
export async function addUnitAction(plate: string, details: unknown, secondArrival: boolean): Promise<AddUnitResult> {
  const user = await requireModule("documents");
  const p = z.string().min(1).max(20).safeParse(plate), d = detailsSchema.safeParse(details);
  if (!p.success || !d.success) return { ok: false, message: "Some details are too long or missing." };
  const r = await addUnit(p.data, d.data, user.id, !!secondArrival);
  if (r.ok) { revalidatePath("/documents", "layout"); after(() => carAdded(r.plate, [d.data.year_model, d.data.make, d.data.model_variant].filter(Boolean).join(" "), user.id)); }
  return r;
}

/** The batch is in: the staff get one message that the scan is finished. */
export async function finishAddAction(plate: string): Promise<Done> {
  await requireModule("documents");
  const p = plateSchema.safeParse(plate);
  if (!p.success) return { ok: false, message: "Bad plate." };
  return guard<Done>(async () => {
    const key = normalizePlate(p.data);
    await createAdminClient().from("unit_workflow").update({ scan_notified_at: null }).eq("plate_no", key); // a new batch is announced again
    if (readerMode() === "grokbot") scheduleScan(key, 0); // the bot scans the batch now; the team is told when it has read it
    else await afterReading(key).catch(() => undefined);
    revalidatePath(`/documents/${key}`);
    revalidatePath("/documents");
    return { ok: true as const, message: "Done." };
  }, (message) => ({ ok: false as const, message }));
}

// ---------------- receipts in the car's folder ----------------

/** Puts the car's approved receipts (and their proofs) into its Drive folder. Documentation and Admin only: it is never done by itself. */
export async function fileReceiptsAction(plate: string): Promise<Done> {
  await requireModule("documents");
  const p = plateSchema.safeParse(plate);
  if (!p.success) return { ok: false, message: "Bad plate." };
  return guard<Done>(async () => {
    const r = await fileCarReceipts(p.data);
    await scanFolder(p.data).catch(() => undefined);
    revalidatePath(`/documents/${normalizePlate(p.data)}`);
    return { ok: true as const, message: r.filed ? `${r.filed} receipt${r.filed === 1 ? "" : "s"} put in the car's folder.` : "Every approved receipt is already in the folder." };
  }, (message) => ({ ok: false as const, message }));
}

/** The same button on the deal page: right after the receipt is approved, the unsigned copy goes into the car's folder. Documentation and Admin. */
export async function fileDealReceiptsAction(dealId: string): Promise<Done> {
  await requireModule("documents");
  if (!/^[0-9a-f-]{36}$/i.test(dealId)) return { ok: false, message: "That deal was not found." };
  return guard<Done>(async () => {
    const r = await fileDealReceipts(dealId);
    for (const plate of r.plates) await scanFolder(plate).catch(() => undefined);
    for (const plate of r.plates) revalidatePath(`/documents/${normalizePlate(plate)}`);
    revalidatePath(`/deals/${dealId}`);
    return { ok: true as const, message: r.filed ? `${r.filed} receipt${r.filed === 1 ? "" : "s"} saved in the car's folder as UNSIGNED copies.` : "Every approved receipt is already in the folder." };
  }, (message) => ({ ok: false as const, message }));
}

// ---------------- the Docs Bible register ----------------

/** Fills the car's row in MAD from its scan and checklist, now. Documentation and Admin. Needs the case chosen by a person. */
export async function updateRegisterAction(plate: string): Promise<Done> {
  const user = await requireModule("documents");
  const p = plateSchema.safeParse(plate);
  if (!p.success) return { ok: false, message: "Bad plate." };
  return guard<Done>(async () => {
    const r = await syncRegister(p.data, user.id);
    revalidatePath("/documents", "layout");
    return r.ok ? { ok: true as const, message: r.changed.length ? `The car record was updated (${r.changed.length} ${r.changed.length === 1 ? "column" : "columns"}).` : "The car record already matches this car's papers." } : { ok: false as const, message: r.message };
  }, (message) => ({ ok: false as const, message }));
}

/** Admin only: take a car out of MAD (entered by mistake). Archived, not destroyed; refused while the car has an AR. */
export async function removeUnitAction(plate: string): Promise<Done> {
  const user = await requireAdmin();
  const p = plateSchema.safeParse(plate);
  if (!p.success) return { ok: false, message: "Bad plate." };
  return guard<Done>(async () => {
    const r = await removeUnit(p.data, user.id);
    if (r.ok) { revalidatePath("/documents", "layout"); revalidatePath("/cars"); }
    return r;
  }, (message) => ({ ok: false as const, message }));
}

const fixSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("approval") }), z.object({ kind: z.literal("handoff-reopen") }), z.object({ kind: z.literal("handoff-undo") }),
  z.object({ kind: z.literal("handoff-edit"), note: z.string().max(300), checked: z.array(z.string().max(60)).max(40) }),
]);

/** Admin only: change a step that was already taken (withdraw the approval, edit or take back the handoff). The page asks first; every change is logged. */
export async function adminFixAction(plate: string, fix: unknown): Promise<Done> {
  const user = await requireAdmin();
  const p = plateSchema.safeParse(plate), f = fixSchema.safeParse(fix);
  if (!p.success || !f.success) return { ok: false, message: "Bad request." };
  return guard<Done>(async () => {
    const r = await adminFix(p.data, f.data, user.id);
    if (!r.ok) return { ok: false as const, message: "error" in r ? r.error : "Could not do that." };
    revalidatePath("/documents", "layout");
    return { ok: true as const, message: { approval: "The approval was withdrawn. Approve again when the documents are right.", "handoff-edit": "The handoff was updated.", "handoff-reopen": "Marked as not back yet. The reminders start again.", "handoff-undo": "The handoff was taken back." }[f.data.kind] };
  }, (message) => ({ ok: false as const, message }));
}
