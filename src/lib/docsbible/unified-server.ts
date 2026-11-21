import "server-only";
import { listCarRows } from "@/lib/docs/data";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadGrid } from "./grid-server";
import type { GridRow } from "./grid";
import { parseSheetDate } from "@/lib/cars/model";
import { manilaToday } from "@/lib/dates";
import { orStatus } from "./or-expiry";
import { paperProgress, stageOf, type StageFacts, type UnifiedRow } from "./unified";
import { handoffMap, type HandoffInfo } from "@/lib/transfers/handoff";

const FOLDER_KEY: Record<string, StageFacts["folderStatus"]> = { unlinked: "unlinked", unread: "unread", review: "review", missing: "missing", complete: "complete" };

/** The register (400 cars) joined, by plate, with the folders, scans and workflow. Both lists the page needs come from one read. */
export async function loadUnified(): Promise<{ rows: UnifiedRow[]; grid: GridRow[] }> {
  const admin = createAdminClient();
  const [grid, folders, flows] = await Promise.all([
    loadGrid(),
    listCarRows(),
    admin.from("unit_workflow").select("plate_no, docs_approved_at, handoff_at, handoff_returned_at").limit(5000),
  ]);
  const flow = new Map((flows.data ?? []).map((f) => [f.plate_no, f]));
  const hand = await handoffMap().catch(() => new Map<string, HandoffInfo>()); // the handoff is kept on the car's sale/transfer record
  const folder = new Map(folders.map((f) => [f.plate, f]));
  const out: UnifiedRow[] = [];
  const today = manilaToday();
  const seen = new Set<string>();
  const make = (plate: string, g: GridRow | null): UnifiedRow => {
    const f = folder.get(plate) ?? null, w = flow.get(plate) ?? null;
    const v = g?.values ?? {};
    const car = [v.year_model, v.make, v.model_variant, v.color].filter(Boolean).join(" ") || f?.name || (g?.values.plate_display ?? plate);
    const stage = stageOf({ hasFolder: !!f, linked: f?.match === "linked", files: f?.files ?? 0, location: f?.location ?? null, folderStatus: f ? FOLDER_KEY[f.status.key] ?? null : null, approved: !!w?.docs_approved_at, handoffAt: hand.get(plate)?.handedOffAt ?? null, returnedAt: hand.get(plate)?.backAt ?? null });
    const caseLabel = v.classification && v.classification !== "Not classified (legacy)" ? v.classification : f?.caseLabel ?? "Not classified";
    return {
      unitId: g?.id ?? null, plate, plateDisplay: (v.plate_display as string | null) ?? f?.plateDisplay ?? plate, car, caseLabel, stage, papers: g ? paperProgress(v) : null,
      flagged: f?.status.key === "review", decisions: g?.decisions ?? 0, files: f?.files ?? 0, location: f?.location ?? null, folder: f && f.match === "linked" ? f.location : "none",
      or: /^(sold)$/i.test(String(v.sale_status ?? "")) || v.vehicle_status === "SOLD" ? { state: "unknown", days: null } : orStatus(v.renewal ? parseSheetDate(String(v.renewal)) : null, today), buyer: f?.deal?.buyerName ?? null, complete: g?.complete ?? null,
      searchText: `${(v.plate_display as string | null) ?? plate} ${car} ${v.reg_owner_name ?? ""} ${f?.deal?.buyerName ?? ""} ${f?.deal?.dealNo ?? ""}`.toLowerCase(),
    };
  };
  for (const g of grid) { const plate = String(g.values.plate_display ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""); if (!plate || seen.has(plate)) continue; seen.add(plate); out.push(make(plate, g)); }
  for (const f of folders) if (!seen.has(f.plate)) { seen.add(f.plate); out.push(make(f.plate, null)); }
  return { rows: out, grid };
}
