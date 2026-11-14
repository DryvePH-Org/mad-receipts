import type { Json, Tables } from "@/lib/supabase/database.types";
import { analyze, checklist, folderStatus, type Analysis, type Checklist, type DealContext, type FileInput, type FolderStatus } from "./analyze";
import { CASES, DOC_TYPES, type CaseType, type Detection, type DocType } from "./types";

export type FolderRow = Tables<"unit_folders">;
export type FileRow = Tables<"folder_files">;

/** The stored reading of a file: what the reader saw, as a list. */
export function detectionsOf(details: Json): Detection[] | null {
  const raw = details && typeof details === "object" && !Array.isArray(details) ? (details as Record<string, Json>).detections : null;
  return Array.isArray(raw) ? (raw as unknown as Detection[]) : null;
}

/** What the reader wrote about a photo besides the documents: whether it was legible and its own note. */
export function readingNotes(details: Json): { legible: boolean | null; notes: string | null } {
  const d = details && typeof details === "object" && !Array.isArray(details) ? (details as Record<string, Json>) : {};
  return { legible: typeof d.legible === "boolean" ? d.legible : null, notes: typeof d.notes === "string" && d.notes.trim() ? d.notes.trim() : null };
}

/** Warnings a person accepted ("checked, this is fine") on a file. */
export function reviewedOf(details: Json): string[] {
  const raw = details && typeof details === "object" && !Array.isArray(details) ? (details as Record<string, Json>).reviewed : null;
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}

/** True when a person corrected what the bot read on this photo. */
export const wasEdited = (details: Json): boolean => !!(details && typeof details === "object" && !Array.isArray(details) && (details as Record<string, Json>).edited === true);

/** How far the photo must be turned (clockwise) to read upright; for showing it only, Drive is never changed. */
export function rotationOf(details: Json): 0 | 90 | 180 | 270 {
  const raw = details && typeof details === "object" && !Array.isArray(details) ? Number((details as Record<string, Json>).rotation) : 0;
  return raw === 90 || raw === 180 || raw === 270 ? raw : 0;
}

const isDocType = (t: string): t is DocType => (DOC_TYPES as readonly string[]).includes(t);

export const toInput = (f: FileRow): FileInput => ({
  id: f.id, filename: f.filename, createdAt: f.created_at, detections: detectionsOf(f.details),
  readStatus: f.read_status as FileInput["readStatus"],
  reviewedFlags: reviewedOf(f.details),
  manualTypes: f.doc_types_source === "manual" ? f.doc_types.filter(isDocType) : null,
});

export interface Car {
  folder: FolderRow;
  files: FileRow[];
  analysis: Analysis;
  /** The case in use: the person's choice, else what the documents suggest, else clean. */
  caseType: CaseType;
  suggestedCase: CaseType;
  caseReason: string;
  checklist: Checklist;
  status: FolderStatus;
  pending: number;
}

/** Everything about one car, worked out from its folder row, its files and its deal. */
export function buildCar(folder: FolderRow, files: FileRow[], deal: DealContext): Car {
  const inputs = files.map(toInput);
  deal = { ...deal, linked: !!folder.deal_id };
  const analysis = analyze(inputs, { plate: folder.plate_no, caseType: (CASES as readonly string[]).includes(folder.case_type ?? "") ? (folder.case_type as CaseType) : null }, deal);
  const chosen = folder.case_source === "manual" && folder.case_type && (CASES as readonly string[]).includes(folder.case_type) ? (folder.case_type as CaseType) : null;
  const caseType = chosen ?? analysis.suggestedCase;
  const list = checklist(caseType, analysis.files, deal);
  const pending = files.filter((f) => f.read_status === "pending").length;
  return { folder, files, analysis, caseType, suggestedCase: analysis.suggestedCase, caseReason: analysis.caseReason, checklist: list, status: folderStatus(list, analysis.files, pending, folder.match_status === "linked" && !!folder.folder_id), pending };
}
