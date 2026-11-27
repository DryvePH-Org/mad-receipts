import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCar, type Car, type FileRow, type FolderRow } from "./car";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saleOfPlate } from "./service";
import { normalizePlate } from "@/lib/rules/plate";
import { CASE_LABELS } from "./types";
import { selectAll } from "@/lib/supabase/select-all";

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
  /** how the sale is paid, as someone set it on the sale record (null: no sale, or not said) */
  payment: string | null;
  /** who bought it: the AR's buyer, else the buyer of the sale recorded on the car */
  buyer: string | null;
  scannedAt: string | null;
  searchText: string;
}

export async function listCarRows(): Promise<CarRow[]> {
  const admin = createAdminClient();
  // everything is asked at the same time; the files come in pages (the database gives 1000 rows at most per request)
  const [{ data: folders }, files, { data: sold }] = await Promise.all([
    admin.from("unit_folders").select("*").order("plate_display").limit(5000),
    selectAll<FileRow>((from, to) => admin.from("folder_files").select("*").order("id").range(from, to) as unknown as PromiseLike<{ data: FileRow[] | null; error: { message: string } | null }>),
    (admin as unknown as SupabaseClient).from("car_sales").select("plate_no, buyer, payment_status").neq("stage", "cancelled").eq("is_reference", false).limit(6000),
  ]);
  const byPlate = new Map<string, FileRow[]>();
  for (const f of files) byPlate.set(f.plate_no, [...(byPlate.get(f.plate_no) ?? []), f]);
  const deals = await dealsById([...new Set((folders ?? []).map((f) => f.deal_id).filter((x): x is string => !!x))]);
  const saleBy = new Map(((sold ?? []) as { plate_no: string; buyer: string | null; payment_status: string | null }[]).map((s) => [s.plate_no, s]));
  return (folders ?? []).map((folder: FolderRow) => {
    const deal = folder.deal_id ? deals.get(folder.deal_id) ?? null : null;
    const sale = deal ? null : saleBy.get(folder.plate_no) ?? null;
    const car = buildCar(folder, byPlate.get(folder.plate_no) ?? [], { buyerName: deal?.buyerName ?? sale?.buyer ?? null, hasReceipt: deal?.hasReceipt ?? false, linked: !!sale });
    return {
      plate: folder.plate_no, plateDisplay: folder.plate_display, name: folder.folder_name ?? folder.plate_display, location: folder.location as CarRow["location"],
      match: folder.match_status as CarRow["match"], caseLabel: CASE_LABELS[car.caseType], status: car.status, missing: car.checklist.missing.length, files: car.files.length,
      deal, payment: saleBy.get(folder.plate_no)?.payment_status ?? null, buyer: deal?.buyerName ?? sale?.buyer ?? null, scannedAt: folder.scanned_at, searchText: `${folder.plate_display} ${folder.folder_name ?? ""} ${deal?.buyerName ?? sale?.buyer ?? ""} ${deal?.dealNo ?? ""}`.toLowerCase(),
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
  const sale = deal ? null : await saleOfPlate(admin, key).catch(() => null); // no AR: a sale recorded by hand stands in for it
  return { car: buildCar(folder, files ?? [], { buyerName: deal?.buyerName ?? sale?.buyer ?? null, hasReceipt: deal?.hasReceipt ?? false, linked: !!sale }), deal };
}

