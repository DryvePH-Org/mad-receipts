import "server-only";
import { normalizePlate } from "@/lib/rules/plate";
import { createAdminClient } from "@/lib/supabase/admin";
import { isScanning } from "./bot-scan";
import { loadCar } from "./service";
import { stageApprovalRule, type Rule, type StageCheck } from "./stage";
import { TRANSFER_PAPERS } from "./transfer-papers";

// What is open on the OUT documents and on the papers back from the transfer of one car, read from the database. The page shows it, and the server actions ask the same rule.

/** The OUT documents: the AR, the buyer's ID and the deed signed with the buyer (the items of the sold stage), their photos and their warnings. */
export async function outCheck(plate: string, admin = createAdminClient()): Promise<StageCheck & { rule: Rule }> {
  const key = normalizePlate(plate);
  const car = await loadCar(key, { admin });
  const files = (car?.files ?? []).filter((f) => f.stage === "out");
  const ids = new Set(files.map((f) => f.id));
  const items = (car?.checklist.items ?? []).filter((i) => i.stage === "sold");
  const flagged = (car?.analysis.files ?? []).filter((r) => ids.has(r.id) && (r.flags.length > 0 || r.types.some((t) => t === "id_unmatched" || t === "deed_unmatched"))).length;
  const check: StageCheck = {
    missing: items.filter((i) => !i.present && !i.optional).map((i) => i.label), pending: files.filter((f) => f.read_status === "pending").length,
    failed: files.filter((f) => f.read_status === "failed").length, flagged, scanning: await isScanning(key, admin, Date.now(), "out"),
  };
  return { ...check, rule: stageApprovalRule(check) };
}

/** The papers back from the transfer: OR, CR, PNP clearance and macro-etching (each is on the list once a copy of it is in). */
export async function transferCheck(plate: string, admin = createAdminClient()): Promise<StageCheck & { rule: Rule }> {
  const key = normalizePlate(plate);
  const car = await loadCar(key, { admin });
  const files = (car?.archive ?? []).filter((f) => f.archive === "transfer");
  const have = new Set(files.map((f) => f.archive_tag));
  const check: StageCheck = {
    missing: TRANSFER_PAPERS.filter((p) => !have.has(p.key)).map((p) => p.label), pending: files.filter((f) => f.read_status === "pending").length,
    failed: files.filter((f) => f.read_status === "failed").length, flagged: 0, scanning: await isScanning(key, admin, Date.now(), "transfer"),
  };
  return { ...check, rule: stageApprovalRule(check) };
}
