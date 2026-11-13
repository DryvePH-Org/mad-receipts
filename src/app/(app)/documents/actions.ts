"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModule } from "@/lib/auth";
import { chooseFolder, defaultDocsDeps, docsErrorText, linkFolder, previewCarFolder, type FolderPreview, moveToSold, readPending, refreshFolders, scanFolder, setCase, setFileTypes, type MoveResult, type ReadProgress } from "@/lib/docs/service";
import { CASES, CHOOSABLE, type CaseType, type DocType } from "@/lib/docs/types";
import { inventory } from "@/lib/inventory";
import { afterReading, approveUnit, handoffUnit, returnUnit, saveDetails, setHandoffChecked, type StepResult } from "@/lib/docs/workflow";
import { normalizePlate } from "@/lib/rules/plate";
import { createAdminClient } from "@/lib/supabase/admin";

export type Done = { ok: true; message: string } | { ok: false; message: string };
const plateSchema = z.string().min(5).max(20);

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
    const r = await approveUnit(p.data, user.id, confirmIncomplete);
    if (r.ok) revalidatePath("/documents", "layout");
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
    const r = await handoffUnit(p.data, String(note ?? ""), user.id, confirmIncomplete);
    if (r.ok) revalidatePath("/documents", "layout");
    return outcome(r, "Handed off. You will be reminded every 3 days until it is marked as done.");
  }, (message) => ({ ok: false as const, message }));
}

export async function returnUnitAction(plate: string): Promise<Done> {
  const user = await requireModule("documents");
  const p = plateSchema.safeParse(plate);
  if (!p.success) return { ok: false, message: "Bad plate." };
  return guard<Done>(async () => {
    const r = await returnUnit(p.data, user.id);
    if (!r.ok) return { ok: false as const, message: "error" in r ? r.error : "Could not do that." };
    revalidatePath("/documents", "layout");
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
    await afterReading(key).catch(() => undefined);
    revalidatePath(`/documents/${key}`);
    revalidatePath("/documents");
    return { ok: true as const, message: "Done." };
  }, (message) => ({ ok: false as const, message }));
}
