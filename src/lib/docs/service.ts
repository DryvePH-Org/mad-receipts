import "server-only";
import { normalizePlate } from "@/lib/rules/plate";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { GroqError } from "@/lib/voice/groq";
import { buildCar, detectionsOf, toInput, type Car, type FileRow, type FolderRow } from "./car";
import { docsBridge, plateOfFolderName, type DocsBridge, type DriveFolder, type Root } from "./bridge";
import { fakeReading, readDocument, ReaderError, type Reading } from "./reader";
import { DOC_TYPES, type CaseType, type DocType } from "./types";

type Admin = ReturnType<typeof createAdminClient>;
export interface DocsDeps {
  bridge: DocsBridge; read: (image: { base64: string; mime: string }, filename: string, plate: string) => Promise<Reading>; admin: Admin;
  /** runs when the last waiting photo of a car has been read (tells the staff on Telegram); a failure here never matters */
  after?: (plate: string) => Promise<void>;
}

export const defaultDocsDeps = (): DocsDeps => ({
  bridge: docsBridge(),
  read: (image, filename, plate) => (process.env.DOCS_FAKE_READER === "1" ? Promise.resolve(fakeReading(filename, plate)) : readDocument(image)),
  admin: createAdminClient(),
  after: (plate) => import("./workflow").then((m) => m.afterReading(plate)),
});

/** Big enough to read small print, small enough to be quick and cheap to send. */
const PREVIEW_SIZE = 1200;
export const READ_AT_ONCE = 3;
const READABLE = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/;

/** A message staff can act on, from whatever went wrong in Drive or with the reader. */
export function docsErrorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/Unknown action/i.test(message)) return "The Google Apps Script is still the old version. Paste the new Code.gs, set the DOC_AVAILABLE_ID and DOC_SOLD_ID properties, and deploy a new version.";
  if (/Set the DOC_/i.test(message)) return message;
  if (/Could not reach|did not answer/i.test(message)) return message;
  if (err instanceof GroqError || err instanceof ReaderError) return err.message;
  return message.replace(/\s+/g, " ").trim().slice(0, 300) || "Something went wrong with the documents folder.";
}

// ---------------- folders ----------------

async function dealInfo(admin: Admin, dealId: string | null): Promise<{ buyerName: string | null; hasReceipt: boolean }> {
  if (!dealId) return { buyerName: null, hasReceipt: false };
  const [{ data: deal }, { count }] = await Promise.all([
    admin.from("deals").select("buyer_name").eq("id", dealId).maybeSingle(),
    admin.from("receipts").select("id", { count: "exact", head: true }).eq("deal_id", dealId).in("status", ["pending", "approved"]),
  ]);
  return { buyerName: deal?.buyer_name ?? null, hasReceipt: (count ?? 0) > 0 };
}

export async function loadCar(plate: string, deps: Pick<DocsDeps, "admin"> = { admin: createAdminClient() }): Promise<Car | null> {
  const key = normalizePlate(plate);
  const { data: folder } = await deps.admin.from("unit_folders").select("*").eq("plate_no", key).maybeSingle();
  if (!folder) return null;
  const { data: files } = await deps.admin.from("folder_files").select("*").eq("plate_no", key).order("created_at").order("filename");
  return buildCar(folder, files ?? [], await dealInfo(deps.admin, folder.deal_id));
}

const folderFields = (f: DriveFolder) => ({ folder_id: f.id, folder_name: f.name, folder_url: f.url, location: f.root });

/**
 * Finds the car's folder by plate and links it to the deal. One folder: linked. None or several: a person looks.
 * Run after an AR is created (the "docs" sync job) and by "Find the folder again".
 */
export async function linkFolder(plateDisplay: string, dealId: string | null, deps: DocsDeps = defaultDocsDeps()): Promise<"linked" | "none" | "several"> {
  const plate = normalizePlate(plateDisplay);
  const found = await deps.bridge.findFolder(plate);
  const row = { plate_no: plate, plate_display: plateDisplay.trim().toUpperCase(), ...(dealId ? { deal_id: dealId } : {}) };
  if (found.length === 1) {
    const { error } = await deps.admin.from("unit_folders").upsert({ ...row, ...folderFields(found[0]), match_status: "linked", candidates: [] }, { onConflict: "plate_no" });
    if (error) throw new Error(`Could not save the folder link: ${error.message}`);
    await scanFolder(plate, deps);
    await readPending(plate, READ_AT_ONCE * 2, deps).catch(() => undefined); // start reading now; the scheduler finishes the rest
    return "linked";
  }
  const status = found.length === 0 ? "none" : "several";
  const { error } = await deps.admin.from("unit_folders").upsert({ ...row, folder_id: null, folder_name: null, folder_url: null, match_status: status, candidates: found.map((f) => ({ id: f.id, name: f.name, url: f.url, root: f.root })) as unknown as Json }, { onConflict: "plate_no" });
  if (error) throw new Error(`Could not save the folder link: ${error.message}`);
  return status;
}

/** Uses one of the several candidate folders (Documentation decides which is right). */
export async function chooseFolder(plate: string, folderId: string, deps: DocsDeps = defaultDocsDeps()): Promise<void> {
  const key = normalizePlate(plate);
  const { data: row } = await deps.admin.from("unit_folders").select("candidates").eq("plate_no", key).single();
  const candidate = ((row?.candidates ?? []) as unknown as DriveFolder[]).find((c) => c.id === folderId);
  if (!candidate) throw new Error("That folder is not one of the matches.");
  await deps.admin.from("unit_folders").update({ ...folderFields(candidate), match_status: "linked", candidates: [] }).eq("plate_no", key);
  await scanFolder(key, deps);
}

/** Lists Available and Sold and makes sure every car folder has a row, linked to its deal when there is one. */
export async function refreshFolders(deps: DocsDeps = defaultDocsDeps()): Promise<{ folders: number; skipped: number; duplicates: number }> {
  const lists = await Promise.all((["available", "sold"] as Root[]).map((r) => deps.bridge.listFolders(r)));
  const byPlate = new Map<string, DriveFolder[]>();
  let skipped = 0;
  for (const folder of lists.flat()) {
    const plate = plateOfFolderName(folder.name);
    if (!plate) { skipped++; continue; }
    byPlate.set(plate, [...(byPlate.get(plate) ?? []), folder]);
  }
  const { data: units } = await deps.admin.from("deal_units").select("plate_no, deal_id").in("plate_no", [...byPlate.keys()].slice(0, 2000));
  const dealOf = new Map((units ?? []).map((u) => [u.plate_no, u.deal_id]));
  let duplicates = 0;
  for (const [plate, list] of byPlate) {
    const display = /\(([^()]+)\)\s*$/.exec(list[0].name)?.[1].trim().toUpperCase() ?? plate;
    const base = { plate_no: plate, plate_display: display, ...(dealOf.has(plate) ? { deal_id: dealOf.get(plate) } : {}) };
    if (list.length === 1) await deps.admin.from("unit_folders").upsert({ ...base, ...folderFields(list[0]), match_status: "linked", candidates: [] }, { onConflict: "plate_no" });
    else {
      duplicates++;
      await deps.admin.from("unit_folders").upsert({ ...base, folder_id: null, folder_name: null, folder_url: null, match_status: "several", candidates: list as unknown as Json }, { onConflict: "plate_no" });
    }
  }
  return { folders: byPlate.size, skipped, duplicates };
}

// ---------------- files ----------------

/** Reads the folder's file list into the database. New files wait to be read. */
export async function scanFolder(plate: string, deps: DocsDeps = defaultDocsDeps()): Promise<number> {
  const key = normalizePlate(plate);
  const { data: folder } = await deps.admin.from("unit_folders").select("folder_id").eq("plate_no", key).single();
  if (!folder?.folder_id) throw new Error("This car has no folder linked yet.");
  const listing = await deps.bridge.listFiles(folder.folder_id);
  const { data: known } = await deps.admin.from("folder_files").select("drive_file_id").eq("plate_no", key);
  const have = new Set((known ?? []).map((k) => k.drive_file_id));
  const fresh = listing.files.filter((f) => !have.has(f.id));
  if (fresh.length) {
    const { error } = await deps.admin.from("folder_files").insert(fresh.map((f) => ({
      plate_no: key, drive_file_id: f.id, filename: f.name, mime_type: f.mimeType, size_bytes: f.size, drive_url: f.url, source: "drive",
      created_at: f.createdAt,
      // a file that is not a picture or a PDF cannot be read: it is just "other"
      ...(READABLE.test(f.mimeType) ? {} : { read_status: "done", doc_types: ["other"] }),
    })));
    if (error) throw new Error(`Could not save the file list: ${error.message}`);
  }
  await deps.admin.from("unit_folders").update({ scanned_at: new Date().toISOString(), location: listing.root }).eq("plate_no", key);
  await recompute(key, deps);
  return fresh.length;
}

/** Re-works the types, flags and duplicates of a car's files, and the suggested case. */
export async function recompute(plate: string, deps: Pick<DocsDeps, "admin"> = { admin: createAdminClient() }): Promise<Car | null> {
  const car = await loadCar(plate, deps);
  if (!car) return null;
  for (const r of car.analysis.files) {
    const file = car.files.find((f) => f.id === r.id)!;
    const types = file.doc_types_source === "manual" ? file.doc_types : r.types;
    const same = JSON.stringify([types, r.flags, r.duplicateOf]) === JSON.stringify([file.doc_types, file.flags, file.duplicate_of]);
    if (!same) await deps.admin.from("folder_files").update({ doc_types: types, flags: r.flags, duplicate_of: r.duplicateOf }).eq("id", file.id);
  }
  if (car.folder.case_source === "auto" && car.files.some((f) => f.read_status === "done") && car.folder.case_type !== car.suggestedCase) {
    await deps.admin.from("unit_folders").update({ case_type: car.suggestedCase }).eq("plate_no", car.folder.plate_no);
  }
  return loadCar(plate, deps);
}

export interface ReadProgress { read: number; remaining: number; waitSeconds: number | null; error: string | null }

/** Reads up to `limit` waiting (or failed) photos of a car. Stops politely when the AI service asks to wait. */
export async function readPending(plate: string, limit = 2, deps: DocsDeps = defaultDocsDeps(), opts: { retryFailed?: boolean } = {}): Promise<ReadProgress> {
  const key = normalizePlate(plate);
  const statuses = opts.retryFailed ? ["pending", "failed"] : ["pending"];
  const { data: todo } = await deps.admin.from("folder_files").select("*").eq("plate_no", key).in("read_status", statuses).order("created_at").order("filename").limit(limit);
  let read = 0, error: string | null = null, waitSeconds: number | null = null;
  // A few photos at a time: each is a separate request, so they are read side by side.
  await Promise.all((todo ?? []).map(async (file) => {
    try {
      const preview = await deps.bridge.preview(file.drive_file_id, PREVIEW_SIZE);
      const reading = await deps.read({ base64: preview.base64, mime: preview.mimeType }, file.filename, key);
      await saveReading(deps.admin, file, reading);
      read++;
    } catch (err) {
      error = docsErrorText(err);
      if (err instanceof GroqError) { if (/busy|too many/i.test(err.message)) waitSeconds = 30; return; } // a problem with the AI service, not with the photo: it stays waiting and is tried again later
      await deps.admin.from("folder_files").update({ read_status: "failed", read_error: error, read_at: new Date().toISOString() }).eq("id", file.id);
    }
  }));
  await recompute(key, deps);
  const { count } = await deps.admin.from("folder_files").select("id", { count: "exact", head: true }).eq("plate_no", key).eq("read_status", "pending");
  if (read > 0 && (count ?? 0) === 0) await deps.after?.(key).catch(() => undefined);
  return { read, remaining: count ?? 0, waitSeconds, error };
}

async function saveReading(admin: Admin, file: Pick<FileRow, "id">, reading: Reading) {
  const status = reading.legible ? "done" : "unreadable";
  const best = reading.detections.length ? Math.min(...reading.detections.map((d) => d.confidence)) : null;
  const { error } = await admin.from("folder_files").update({
    read_status: status, read_error: null, read_at: new Date().toISOString(), confidence: best,
    details: { detections: reading.detections, notes: reading.notes, rotation: reading.rotation } as unknown as Json,
  }).eq("id", file.id);
  if (error) throw new Error(`Could not save the reading: ${error.message}`);
}

/**
 * Reads waiting photos across every car, a few at a time, for the scheduler: new photos get read without anyone pressing a button.
 * Each photo is read once; nothing already read is sent again.
 */
export async function readSomePending(limit = 6, deps: DocsDeps = defaultDocsDeps()): Promise<{ read: number; remaining: number; capped?: boolean }> {
  // The free AI plan has a budget per day. The scheduler uses at most DOCS_DAILY_READS (default 60) photos a day and leaves the rest for people pressing "Read".
  const cap = Number(process.env.DOCS_DAILY_READS) || 60;
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const { count: today } = await deps.admin.from("folder_files").select("id", { count: "exact", head: true }).gte("read_at", since.toISOString());
  if ((today ?? 0) >= cap) return { read: 0, remaining: 0, capped: true };
  // With the stand-in reader on (development and the browser tests), only the test cars are touched, never real photos.
  let waiting = deps.admin.from("folder_files").select("plate_no").eq("read_status", "pending");
  if (process.env.DOCS_FAKE_READER === "1") waiting = waiting.like("plate_no", "ZZT%");
  const { data: todo } = await waiting.order("created_at").limit(limit);
  const plates = [...new Set((todo ?? []).map((t) => t.plate_no))];
  let read = 0;
  for (const plate of plates) read += (await readPending(plate, READ_AT_ONCE, deps)).read;
  const { count } = await deps.admin.from("folder_files").select("id", { count: "exact", head: true }).eq("read_status", "pending");
  return { read, remaining: count ?? 0 };
}

// ---------------- what people decide ----------------

const log = (admin: Admin, actor: string, action: string, entityId: string, after: Json) =>
  admin.from("audit_logs").insert({ actor_id: actor, action, entity: "unit_folder", entity_id: null, after: { plate: entityId, ...(after as object) } as Json });

/** A person says what a file is (or null: go back to the reading). */
export async function setFileTypes(fileId: string, types: DocType[] | null, actor: string, deps: DocsDeps = defaultDocsDeps()): Promise<void> {
  if (types && !types.every((t) => (DOC_TYPES as readonly string[]).includes(t))) throw new Error("That is not a document type.");
  const { data: file } = await deps.admin.from("folder_files").select("plate_no, filename").eq("id", fileId).single();
  if (!file) throw new Error("File not found.");
  await deps.admin.from("folder_files").update(types ? { doc_types: types, doc_types_source: "manual" } : { doc_types_source: "auto" }).eq("id", fileId);
  await recompute(file.plate_no, deps);
  await log(deps.admin, actor, "docs.set_types", file.plate_no, { file: file.filename, types });
}

export async function setCase(plate: string, caseType: CaseType | null, actor: string, deps: DocsDeps = defaultDocsDeps()): Promise<void> {
  const key = normalizePlate(plate);
  await deps.admin.from("unit_folders").update(caseType ? { case_type: caseType, case_source: "manual" } : { case_source: "auto" }).eq("plate_no", key);
  await recompute(key, deps);
  await log(deps.admin, actor, "docs.set_case", key, { case: caseType ?? "auto" });
}

export type MoveResult = { ok: true } | { ok: false; needsConfirm: true; missing: string[] } | { ok: false; error: string };

/** Moves the car's folder to Sold. Anything missing needs the person to confirm first. */
export async function moveToSold(plate: string, actor: string, confirmIncomplete: boolean, deps: DocsDeps = defaultDocsDeps()): Promise<MoveResult> {
  const key = normalizePlate(plate);
  const car = await loadCar(key, deps);
  if (!car?.folder.folder_id) return { ok: false, error: "This car has no folder linked." };
  if (car.folder.location === "sold") return { ok: false, error: "This car is already in Sold." };
  const missing = car.checklist.missing.map((m) => m.label);
  const flagged = car.analysis.files.filter((r) => r.flags.length || r.types.some((t) => t === "id_unmatched" || t === "deed_unmatched")).length;
  if ((missing.length || car.pending || flagged) && !confirmIncomplete) {
    return { ok: false, needsConfirm: true, missing: [...missing, ...(car.pending ? [`${car.pending} photo${car.pending === 1 ? "" : "s"} not read yet`] : []), ...(flagged ? [`${flagged} file${flagged === 1 ? "" : "s"} still to check`] : [])] };
  }
  const moved = await deps.bridge.move(car.folder.folder_id);
  await deps.admin.from("unit_folders").update({ ...folderFields(moved), moved_at: new Date().toISOString(), moved_by: actor }).eq("plate_no", key);
  await log(deps.admin, actor, "docs.move_to_sold", key, { complete: missing.length === 0, missing });
  return { ok: true };
}

// ---------------- Sales upload ----------------

export interface UploadResult { fileId: string; filename: string; types: DocType[]; flags: string[]; readStatus: string }

/** One photo from Sales: into the car's Drive folder, then read, and the checklist updates. */
export async function uploadPhoto(input: { plate: string; actor: string; bytes: Uint8Array; mime: string; label?: string }, deps: DocsDeps = defaultDocsDeps()): Promise<UploadResult> {
  const key = normalizePlate(input.plate);
  const { data: folder } = await deps.admin.from("unit_folders").select("folder_id, match_status").eq("plate_no", key).maybeSingle();
  if (!folder?.folder_id || folder.match_status !== "linked") throw new Error("This car has no document folder linked yet. Ask Documentation to check it.");
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const filename = `${stamp}_${input.label ?? "upload"}.jpg`;
  const uploaded = await deps.bridge.upload(folder.folder_id, filename, input.bytes, input.mime);
  const { data: row, error } = await deps.admin.from("folder_files").insert({
    plate_no: key, drive_file_id: uploaded.id, filename, mime_type: input.mime, size_bytes: input.bytes.length, drive_url: uploaded.url, source: "upload", uploaded_by: input.actor,
  }).select("*").single();
  if (error || !row) throw new Error(`Uploaded, but could not record the file: ${error?.message ?? "unknown"}`);
  try {
    const reading = await deps.read({ base64: Buffer.from(input.bytes).toString("base64"), mime: input.mime }, filename, key);
    await saveReading(deps.admin, row, reading);
  } catch (err) {
    await deps.admin.from("folder_files").update({ read_status: "failed", read_error: docsErrorText(err) }).eq("id", row.id);
  }
  const car = await recompute(key, deps);
  await deps.after?.(key).catch(() => undefined);
  const after = car?.files.find((f) => f.id === row.id);
  return { fileId: row.id, filename, types: (after?.doc_types ?? []) as DocType[], flags: after?.flags ?? [], readStatus: after?.read_status ?? "pending" };
}

export { detectionsOf, toInput };
export type { FolderRow };
