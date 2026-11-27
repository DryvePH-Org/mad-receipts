import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePlate } from "@/lib/rules/plate";
import { createAdminClient } from "@/lib/supabase/admin";

// The approval of the OUT documents and of the papers back from the transfer. (The IN approval is on the car's folder row, in workflow.ts.)

export type ApprovedStage = "out" | "transfer";
export interface StageApproval { at: string; by: string | null; byName: string | null }

const db = (): SupabaseClient => createAdminClient() as unknown as SupabaseClient;

/** Who approved each stage of a car, and when (a stage that is not approved is null). */
export async function loadStageApprovals(plate: string, client: SupabaseClient = db()): Promise<Record<ApprovedStage, StageApproval | null>> {
  const out: Record<ApprovedStage, StageApproval | null> = { out: null, transfer: null };
  const { data } = await client.from("unit_stage_approvals").select("stage, approved_at, approved_by, approved_by_name").eq("plate_no", normalizePlate(plate));
  for (const r of data ?? []) if (r.stage === "out" || r.stage === "transfer") out[r.stage as ApprovedStage] = { at: String(r.approved_at), by: (r.approved_by as string | null) ?? null, byName: (r.approved_by_name as string | null) ?? null };
  return out;
}

export async function approveStage(plate: string, stage: ApprovedStage, actor: { id: string; name: string }, client: SupabaseClient = db()): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = normalizePlate(plate);
  const { error } = await client.from("unit_stage_approvals").upsert({ plate_no: key, stage, approved_at: new Date().toISOString(), approved_by: actor.id, approved_by_name: actor.name }, { onConflict: "plate_no,stage" });
  if (error) return { ok: false, error: `Could not save the approval: ${error.message}` };
  await client.from("audit_logs").insert({ actor_id: actor.id, action: `docs.${stage}_approved`, entity: "unit_folder", entity_id: null, after: { plate: key, stage } });
  return { ok: true };
}

/** An Admin takes an approval back (a mistake), so the stage can be checked and approved again. */
export async function withdrawStage(plate: string, stage: ApprovedStage, actor: string, client: SupabaseClient = db()): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = normalizePlate(plate);
  const { error } = await client.from("unit_stage_approvals").delete().eq("plate_no", key).eq("stage", stage);
  if (error) return { ok: false, error: `Could not withdraw the approval: ${error.message}` };
  await client.from("audit_logs").insert({ actor_id: actor, action: `docs.${stage}_approval_withdrawn`, entity: "unit_folder", entity_id: null, after: { plate: key, stage } });
  return { ok: true };
}
