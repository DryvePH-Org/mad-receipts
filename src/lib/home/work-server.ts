import "server-only";
import { SCAN_ACTION } from "@/lib/grokbot/client";
import { queueSnapshot } from "@/lib/grokbot/store";
import { loadCar } from "@/lib/docs/service";
import { loadStageApprovals } from "@/lib/docs/stage-approval";
import { TRANSFER_PAPERS } from "@/lib/docs/transfer-papers";
import { createAdminClient } from "@/lib/supabase/admin";
import { queuePosition, workState, type QueueJob, type WorkItem, type WorkStage } from "./work";

/** How far back a person's uploads count as their work (finished work stays visible for this long). */
export const WORK_DAYS = 3;
const MAX_CARS = 14;

/**
 * The photos this person uploaded in the last days, grouped by car and stage, with where each group is now: waiting for its scanner (and the place in line),
 * being scanned, read, or approved. Reads the car for every group (at most 14), so it is kept to a few days.
 */
export async function loadMyWork(userId: string, now = new Date()): Promise<WorkItem[]> {
  const admin = createAdminClient();
  const since = new Date(now.getTime() - WORK_DAYS * 86_400_000).toISOString();
  const { data: mine } = await admin.from("folder_files").select("plate_no, stage, archive, created_at").eq("uploaded_by", userId).gte("created_at", since).order("created_at", { ascending: false }).limit(500);
  const groups = new Map<string, { plate: string; stage: WorkStage; photos: number; lastAt: string }>();
  for (const f of mine ?? []) {
    if (f.archive && f.archive !== "transfer") continue; // payment papers are not scanned
    const stage: WorkStage = f.archive === "transfer" ? "transfer" : f.stage === "out" ? "out" : f.stage === "transfer" ? "transfer" : "in";
    const k = `${f.plate_no}|${stage}`, g = groups.get(k);
    if (g) { g.photos++; if (f.created_at > g.lastAt) g.lastAt = f.created_at; } else groups.set(k, { plate: f.plate_no, stage, photos: 1, lastAt: f.created_at });
  }
  const list = [...groups.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt)).slice(0, MAX_CARS);
  if (!list.length) return [];
  const plates = [...new Set(list.map((g) => g.plate))];
  const [{ active }, cars, { data: flows }, approvals] = await Promise.all([
    queueSnapshot(admin, 0).catch(() => ({ active: [] })),
    Promise.all(plates.map((p) => loadCar(p, { admin }).catch(() => null))),
    admin.from("unit_workflow").select("plate_no, docs_approved_at").in("plate_no", plates),
    Promise.all(plates.map((p) => loadStageApprovals(p).catch(() => ({ out: null, transfer: null })))),
  ]);
  const carOf = new Map(plates.map((p, i) => [p, cars[i]]));
  const approvedIn = new Set((flows ?? []).filter((f) => !!f.docs_approved_at).map((f) => f.plate_no as string));
  const approvalOf = new Map(plates.map((p, i) => [p, approvals[i]]));
  const jobs: QueueJob[] = active.filter((j) => j.status === "queued" || j.status === "sent").map((j) => ({ action: j.action, bot: j.bot, status: j.status as "queued" | "sent", priority: j.priority, createdAt: j.createdAt, plate: j.plate }));

  const out: WorkItem[] = [];
  for (const g of list) {
    const car = carOf.get(g.plate);
    if (!car) continue;
    const analysis = new Map(car.analysis.files.map((r) => [r.id, r]));
    const flaggedOf = (ids: string[]) => ids.filter((id) => (analysis.get(id)?.flags.length ?? 0) > 0).length;
    let pending = 0, failed = 0, placed = 0, needed = 0, flagged = 0, approved = false;
    if (g.stage === "transfer") {
      const files = car.archive.filter((f) => f.archive === "transfer");
      pending = files.filter((f) => f.read_status === "pending").length; failed = files.filter((f) => f.read_status === "failed").length;
      const have = new Set(files.filter((f) => f.read_status !== "pending").map((f) => f.archive_tag));
      needed = TRANSFER_PAPERS.length; placed = TRANSFER_PAPERS.filter((p) => have.has(p.key)).length;
      approved = !!approvalOf.get(g.plate)?.transfer;
    } else if (g.stage === "out") {
      const files = car.files.filter((f) => f.stage === "out");
      pending = files.filter((f) => f.read_status === "pending").length; failed = files.filter((f) => f.read_status === "failed").length;
      const items = car.checklist.items.filter((i) => i.stage === "sold" && !i.optional);
      needed = items.length; placed = items.filter((i) => i.present).length; flagged = flaggedOf(files.map((f) => f.id));
      approved = !!approvalOf.get(g.plate)?.out;
    } else {
      const files = car.files.filter((f) => (f.stage ?? "in") === "in");
      pending = files.filter((f) => f.read_status === "pending").length; failed = files.filter((f) => f.read_status === "failed").length;
      const items = car.checklist.items.filter((i) => i.stage === "available" && !i.optional);
      needed = items.length; placed = items.filter((i) => i.present).length; flagged = flaggedOf(files.map((f) => f.id));
      approved = approvedIn.has(g.plate);
    }
    const mineJob = jobs.find((j) => j.plate === g.plate && j.action === SCAN_ACTION[g.stage]);
    const job = mineJob ? { status: mineJob.status, position: queuePosition(jobs, mineJob) } : null;
    out.push({ plate: g.plate, plateDisplay: car.folder.plate_display, car: car.folder.folder_name ?? car.folder.plate_display, stage: g.stage, photos: g.photos, lastAt: g.lastAt, state: workState({ stage: g.stage, pending, failed, job, placed, needed, flagged, approved }) });
  }
  return out;
}
