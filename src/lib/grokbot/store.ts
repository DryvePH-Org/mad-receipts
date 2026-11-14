import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { grokbotConfig, type BotName, type Capacity, type Deps, type JobStore } from "./client";

type Admin = ReturnType<typeof createAdminClient>;

/** Jobs kept in the database (server only). */
export function dbJobStore(admin: Admin = createAdminClient()): JobStore {
  return {
    async create(job) {
      const { error } = await admin.from("grokbot_jobs").insert({ id: job.id, action: job.action, status: "queued", bot: job.bot, priority: job.priority, plate_no: job.plate, request: job.request as Json, created_by: job.createdBy });
      if (error) throw new Error(/grokbot_jobs|column|constraint/.test(error.message) ? "This needs the latest database update (migration 27)." : "Could not record the job.");
    },
    async get(id) {
      const { data } = await admin.from("grokbot_jobs").select("id, action, status, result, error").eq("id", id).maybeSingle();
      return data ? { id: data.id, action: data.action, status: data.status as "queued" | "sent" | "done" | "failed", result: data.result, error: data.error } : null;
    },
    async complete(id, result, ok, error) {
      const { data: row } = await admin.from("grokbot_jobs").select("status").eq("id", id).maybeSingle();
      if (!row) return "unknown";
      // the first real answer is final; a job that was waiting or sent can be closed
      const { data: updated } = await admin.from("grokbot_jobs").update({ status: ok ? "done" : "failed", result: result as Json, error, completed_at: new Date().toISOString() }).eq("id", id).in("status", ["queued", "sent"]).select("id");
      return updated?.length ? "stored" : "already";
    },
    async claim(bot, limit) {
      const { data: waiting } = await admin.from("grokbot_jobs").select("id, action, bot, priority, request").eq("status", "queued").eq("bot", bot).order("priority", { ascending: false }).order("created_at").limit(limit);
      const out: Awaited<ReturnType<JobStore["claim"]>> = [];
      for (const j of waiting ?? []) {
        // one place at a time: only the caller that flips the job from queued to sent gets to send it
        const { data: won } = await admin.from("grokbot_jobs").update({ status: "sent", started_at: new Date().toISOString() }).eq("id", j.id).eq("status", "queued").select("id");
        if (won?.length) out.push({ id: j.id, action: j.action, bot: j.bot as BotName, priority: j.priority, request: (j.request ?? {}) as Record<string, unknown> });
      }
      return out;
    },
    async running(bot, since) {
      const { count } = await admin.from("grokbot_jobs").select("id", { count: "exact", head: true }).eq("bot", bot).eq("status", "sent").gte("started_at", since.toISOString());
      return count ?? 0;
    },
    async expire(bot, before) {
      const { data } = await admin.from("grokbot_jobs").update({ status: "failed", error: "The bot did not answer in time.", completed_at: new Date().toISOString() }).eq("bot", bot).eq("status", "sent").lt("started_at", before.toISOString()).select("id");
      return (data ?? []).map((r) => r.id);
    },
  };
}

/** How many jobs each bot may run at once: the sheet bot one (so edits never overlap); the scanner GROKBOT_SCAN_PARALLEL (default 1). */
export function capacityFromEnv(env: Record<string, string | undefined> = process.env): Capacity {
  const n = Number(env.GROKBOT_SCAN_PARALLEL);
  return { sheet: 1, scan: Number.isInteger(n) && n >= 1 && n <= 4 ? n : 1 };
}

export const defaultGrokbotDeps = (): Deps => ({
  store: dbJobStore(), config: grokbotConfig(), capacity: capacityFromEnv(),
  // a scan that failed without an answer marks its photos failed, so they never stay "waiting" forever
  onFailed: (id) => (id.startsWith("docs_scan-") ? import("@/lib/docs/bot-scan").then((m) => m.applyScanAnswer(id)) : Promise.resolve()),
});

export interface QueueRow { id: string; action: string; bot: BotName; status: "queued" | "sent" | "done" | "failed"; plate: string | null; priority: number; createdAt: string; startedAt: string | null; completedAt: string | null; error: string | null; /** seconds waiting in line, and seconds with the bot (so far, or in all) */ waitSec: number; runSec: number | null }

const secs = (a: string | null, b: number) => (a ? Math.max(0, Math.round((b - Date.parse(a)) / 1000)) : null);
const toRow = (now: number) => (j: { id: string; action: string; bot: string; status: string; plate_no: string | null; priority: number; created_at: string; started_at: string | null; completed_at: string | null; error: string | null }): QueueRow =>
  ({ id: j.id, action: j.action, bot: j.bot as BotName, status: j.status as QueueRow["status"], plate: j.plate_no, priority: j.priority, createdAt: j.created_at, startedAt: j.started_at, completedAt: j.completed_at, error: j.error, waitSec: secs(j.created_at, j.started_at ? Date.parse(j.started_at) : now) ?? 0, runSec: j.started_at ? secs(j.started_at, j.completed_at ? Date.parse(j.completed_at) : now) : null });
const COLS = "id, action, bot, status, plate_no, priority, created_at, started_at, completed_at, error";

/** Everything waiting or running, then the latest finished jobs (for the Admin queue view). */
export async function queueSnapshot(admin: Admin = createAdminClient(), recent = 15): Promise<{ active: QueueRow[]; recent: QueueRow[] }> {
  const [{ data: active }, { data: done }] = await Promise.all([
    admin.from("grokbot_jobs").select(COLS).in("status", ["queued", "sent"]).order("created_at").limit(200),
    admin.from("grokbot_jobs").select(COLS).in("status", ["done", "failed"]).order("completed_at", { ascending: false }).limit(recent),
  ]);
  const now = Date.now();
  return { active: (active ?? []).map(toRow(now)), recent: (done ?? []).map(toRow(now)) };
}

export interface PlateWork { id: string; action: string; bot: BotName; status: "queued" | "sent"; /** 1 = next to run or running; null when running */ position: number | null; since: string }

/** What the bots are doing or about to do for one car, with its place in line (for the car page). */
export async function workForPlate(plate: string, admin: Admin = createAdminClient()): Promise<PlateWork[]> {
  const { data: mine } = await admin.from("grokbot_jobs").select(COLS).eq("plate_no", plate).in("status", ["queued", "sent"]).order("created_at");
  if (!mine?.length) return [];
  const { data: active } = await admin.from("grokbot_jobs").select("id, bot, status, priority, created_at").in("status", ["queued", "sent"]).limit(500);
  return mine.map((j) => {
    // place in line = the jobs of the same bot that will be sent before this one, plus those running, plus itself
    const ahead = (active ?? []).filter((a) => a.bot === j.bot && a.id !== j.id && (a.status === "sent" || a.priority > j.priority || (a.priority === j.priority && a.created_at < j.created_at))).length;
    return { id: j.id, action: j.action, bot: j.bot as BotName, status: j.status as "queued" | "sent", position: j.status === "queued" ? ahead + 1 : null, since: j.started_at ?? j.created_at };
  });
}
