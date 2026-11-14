"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireModule } from "@/lib/auth";
import { editReading, reviewFlag, chooseFolder, defaultDocsDeps, docsErrorText, linkFolder, previewCarFolder, type FolderPreview, moveToSold, readPending, refreshFolders, scanFolder, setCase, setFileTypes, type MoveResult, type ReadProgress } from "@/lib/docs/service";
import { CASES, CHOOSABLE, type CaseType, type DocType } from "@/lib/docs/types";
import { inventory } from "@/lib/inventory";
import { readerMode, scheduleScan } from "@/lib/docs/bot-scan";
import { allowed } from "@/lib/docs/stage";
import { stageFor } from "@/lib/docs/stage-server";
import { markWorking, queueSheetSync, runCheckInBackground, runSendInBackground } from "@/lib/docs/bible-sync";
import { sheetsFrozen } from "@/lib/google/freeze";
import { afterReading, approveUnit, handoffUnit, returnUnit, saveDetails, setHandoffChecked, type StepResult } from "@/lib/docs/workflow";
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
    const added = await scanFolder(p.data);
    revalidatePath(`/documents/${normalizePlate(p.data)}`);
    return { ok: true as const, message: added ? `${added} new file${added === 1 ? "" : "s"} found.` : "No new files." };
  }, (message) => ({ ok: false as const, message }));
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
    if (r.ok) revalidatePath("/documents", "layout");
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
    if (r.ok) { revalidatePath("/documents", "layout"); after(async () => { for (const kind of ["checklist", "pricelist"] as const) await queueSheetSync(p.data, kind, user.id).catch((e) => console.warn(`[docs] sheet update failed: ${e instanceof Error ? e.message : "unknown"}`)); }); }
    return outcome(r, "Approved. Marketing was told on Telegram.");
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
    if (r.ok) { revalidatePath("/documents", "layout"); after(() => queueSheetSync(p.data, "submitted", user.id).catch((e) => console.warn(`[docs] sheet update failed: ${e instanceof Error ? e.message : "unknown"}`))); }
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
    after(() => queueSheetSync(p.data, "received", user.id).catch((e) => console.warn(`[docs] sheet update failed: ${e instanceof Error ? e.message : "unknown"}`)));
    return { ok: true as const, message: "Marked as done. No more reminders for this car." };
  }, (message) => ({ ok: false as const, message }));
}

// ---------------- adding documents by plate ----------------

/** What adding documents for this plate would do: an existing folder, or a new one named from the inventory. */
export async function previewAddAction(plate: string): Promise<FolderPreview> {
  await requireModule("documents");
  const p = z.string().min(1).max(20).safeParse(plate);
  if (!p.success) return { state: "invalid", message: "Type the plate number." };
  try { return await previewCarFolder(p.data, defaultDocsDeps(), (k) => inventory.getUnit(k)); }
  catch (err) { return { state: "invalid", message: docsErrorText(err) }; }
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

// ---------------- the Docs Bible sheet ----------------

/** Starts reading this car's row in the sheet (through the bot) and returns at once: the card shows "working" and then the result. Writes nothing. */
export async function checkSheetAction(plate: string): Promise<Done> {
  const user = await requireModule("documents");
  const p = plateSchema.safeParse(plate);
  if (!p.success) return { ok: false, message: "Bad plate." };
  return guard<Done>(async () => {
    await markWorking(p.data, "check", user.id);
    after(() => runCheckInBackground(p.data, user.id).then(() => undefined, () => undefined));
    revalidatePath(`/documents/${normalizePlate(p.data)}`);
    return { ok: true as const, message: "The bot is reading the sheet. The result appears on this card in a minute or two." };
  }, (message) => ({ ok: false as const, message }));
}

/** Starts sending the checklist to the sheet and returns at once. Refused while the Docs Bible is frozen. */
export async function sendSheetAction(plate: string): Promise<Done> {
  const user = await requireModule("documents");
  const p = plateSchema.safeParse(plate);
  if (!p.success) return { ok: false, message: "Bad plate." };
  if (sheetsFrozen("docs")) return { ok: false, message: "The Docs Bible is frozen: nothing is written to the sheet right now." };
  return guard<Done>(async () => {
    const rule = (await rulesFor(p.data)).sendSheet;
    if (!rule.allowed) return { ok: false as const, message: rule.reason ?? "Approve the documents first." };
    await markWorking(p.data, "send", user.id);
    after(() => runSendInBackground(p.data, user.id).then(() => undefined, () => undefined));
    revalidatePath(`/documents/${normalizePlate(p.data)}`);
    return { ok: true as const, message: "The bot is updating the sheet. The result appears on this card in a minute or two." };
  }, (message) => ({ ok: false as const, message }));
}
