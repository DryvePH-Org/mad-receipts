import "server-only";
import { getSettings } from "@/lib/data";
import { normalizePlate } from "@/lib/rules/plate";
import { createAdminClient } from "@/lib/supabase/admin";
import { isScanning } from "./bot-scan";
import { loadCar } from "./service";
import { deriveStage, type StageInput, type StageModel } from "./stage";
import { loadWorkflow } from "./workflow";

/** What the stage rules need to know about a car, read from the database (the page and the server actions both use it). */
export async function loadStageInput(plate: string, admin = createAdminClient()): Promise<StageInput | null> {
  const key = normalizePlate(plate);
  const car = await loadCar(key, { admin });
  if (!car) return null;
  const [{ workflow }, settings, scanning] = await Promise.all([loadWorkflow(key, admin).catch(() => ({ workflow: { approvedAt: null, handoffAt: null, handoffReturnedAt: null } as { approvedAt: string | null; handoffAt: string | null; handoffReturnedAt: string | null } })), getSettings(), isScanning(key, admin).catch(() => false)]);
  const flagged = car.analysis.files.filter((r) => r.flags.length > 0 || r.types.some((t) => t === "id_unmatched" || t === "deed_unmatched")).length;
  return {
    linked: car.folder.match_status === "linked" && !!car.folder.folder_id, location: car.folder.location as "available" | "sold",
    filesTotal: car.files.length, pending: car.pending, failed: car.files.filter((f) => f.read_status === "failed").length, scanning,
    flaggedFiles: flagged,
    missingBefore: car.checklist.items.filter((i) => i.stage === "available" && !i.present).length,
    missingSold: car.checklist.items.filter((i) => i.stage === "sold" && !i.present).length,
    hasDeal: !!car.folder.deal_id,
    approved: !!workflow.approvedAt, caseChosen: car.folder.case_source === "manual", handoffAt: workflow.handoffAt, returnedAt: workflow.handoffReturnedAt,
    receiver: settings.print.transmittalReceiver || "the receiver",
  };
}

export async function stageFor(plate: string, admin = createAdminClient()): Promise<StageModel | null> {
  const input = await loadStageInput(plate, admin);
  return input ? deriveStage(input) : null;
}
