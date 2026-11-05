import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCar, type Car, type FileRow, type FolderRow } from "./car";
import { normalizePlate } from "@/lib/rules/plate";
import { CASE_LABELS } from "./types";

// Reads for the document pages. Callers check the role first (the pages do), then use the server's access.

export interface DealBrief { id: string; dealNo: string; buyerName: string; hasReceipt: boolean; saleType: string; status: string }

async function dealsById(ids: string[]): Promise<Map<string, DealBrief>> {
  if (!ids.length) return new Map();
  const { data } = await createAdminClient().from("deal_summaries").select("id, deal_no, buyer_name, approved_count, pending_count, sale_type, status").in("id", ids);
  return new Map((data ?? []).map((d) => [d.id, { id: d.id, dealNo: d.deal_no, buyerName: d.buyer_name, hasReceipt: (d.approved_count ?? 0) + (d.pending_count ?? 0) > 0, saleType: d.sale_type, status: d.status }]));
}

export interface CarRow {
  plate: string;
  plateDisplay: string;
  name: string;
  location: "available" | "sold";
  match: "linked" | "none" | "several";
  caseLabel: string;
  status: Car["status"];
  missing: number;
  files: number;
  deal: DealBrief | null;
  scannedAt: string | null;
  searchText: string;
}

export async function listCarRows(): Promise<CarRow[]> {
  const admin = createAdminClient();
  const [{ data: folders }, { data: files }] = await Promise.all([
    admin.from("unit_folders").select("*").order("plate_display").limit(5000),
    admin.from("folder_files").select("*").limit(20000),
  ]);
  const byPlate = new Map<string, FileRow[]>();
  for (const f of files ?? []) byPlate.set(f.plate_no, [...(byPlate.get(f.plate_no) ?? []), f]);
  const deals = await dealsById([...new Set((folders ?? []).map((f) => f.deal_id).filter((x): x is string => !!x))]);
  return (folders ?? []).map((folder: FolderRow) => {
    const deal = folder.deal_id ? deals.get(folder.deal_id) ?? null : null;
    const car = buildCar(folder, byPlate.get(folder.plate_no) ?? [], { buyerName: deal?.buyerName ?? null, hasReceipt: deal?.hasReceipt ?? false });
    return {
      plate: folder.plate_no, plateDisplay: folder.plate_display, name: folder.folder_name ?? folder.plate_display, location: folder.location as CarRow["location"],
      match: folder.match_status as CarRow["match"], caseLabel: CASE_LABELS[car.caseType], status: car.status, missing: car.checklist.missing.length, files: car.files.length,
      deal, scannedAt: folder.scanned_at, searchText: `${folder.plate_display} ${folder.folder_name ?? ""} ${deal?.buyerName ?? ""} ${deal?.dealNo ?? ""}`.toLowerCase(),
    };
  });
}

export interface CarDetail { car: Car; deal: DealBrief | null }

export async function getCarDetail(plate: string): Promise<CarDetail | null> {
  const admin = createAdminClient();
  const key = normalizePlate(plate);
  const { data: folder } = await admin.from("unit_folders").select("*").eq("plate_no", key).maybeSingle();
  if (!folder) return null;
  const { data: files } = await admin.from("folder_files").select("*").eq("plate_no", key).order("created_at").order("filename");
  const deal = folder.deal_id ? (await dealsById([folder.deal_id])).get(folder.deal_id) ?? null : null;
  return { car: buildCar(folder, files ?? [], { buyerName: deal?.buyerName ?? null, hasReceipt: deal?.hasReceipt ?? false }), deal };
}

/** Cars Sales can upload for: those on a deal, newest first, with whether their folder is linked. */
export async function listUploadTargets(): Promise<{ plate: string; display: string; folderName: string | null; buyer: string; dealNo: string; linked: boolean }[]> {
  const admin = createAdminClient();
  const { data: folders } = await admin.from("unit_folders").select("*").not("deal_id", "is", null).order("created_at", { ascending: false }).limit(300);
  const deals = await dealsById([...new Set((folders ?? []).map((f) => f.deal_id).filter((x): x is string => !!x))]);
  return (folders ?? []).map((f) => ({ plate: f.plate_no, display: f.plate_display, folderName: f.folder_name, buyer: deals.get(f.deal_id!)?.buyerName ?? "", dealNo: deals.get(f.deal_id!)?.dealNo ?? "", linked: f.match_status === "linked" && !!f.folder_id }));
}
