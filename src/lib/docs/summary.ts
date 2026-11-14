import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type DocsTone = "zinc" | "blue" | "amber" | "emerald" | "purple";
export interface DocsSummary { label: string; tone: DocsTone; case: string | null }

/** Where each car's documents stand, in words every role can read (nothing about the papers themselves). Keyed by plate. */
export async function loadDocsSummaries(admin = createAdminClient()): Promise<Map<string, DocsSummary>> {
  const [{ data: folders }, { data: flows }] = await Promise.all([
    admin.from("unit_folders").select("plate_no, location, match_status, case_type, case_source, folder_id").limit(5000),
    admin.from("unit_workflow").select("plate_no, docs_approved_at, handoff_at, handoff_returned_at").limit(5000),
  ]);
  const flow = new Map((flows ?? []).map((f) => [f.plate_no, f]));
  const out = new Map<string, DocsSummary>();
  for (const f of folders ?? []) {
    const w = flow.get(f.plate_no);
    const caseLabel = f.case_source === "manual" ? f.case_type : null;
    let s: Omit<DocsSummary, "case">;
    if (w?.handoff_returned_at) s = { label: "Papers done", tone: "emerald" };
    else if (w?.handoff_at) s = { label: "With the processor", tone: "purple" };
    else if (f.location === "sold") s = { label: "In Sold, handoff next", tone: "blue" };
    else if (w?.docs_approved_at) s = { label: "Documents approved", tone: "emerald" };
    else if (f.match_status !== "linked" || !f.folder_id) s = { label: "Folder not linked", tone: "zinc" };
    else s = { label: "Documents in review", tone: "amber" };
    out.set(f.plate_no, { ...s, case: caseLabel });
  }
  return out;
}
