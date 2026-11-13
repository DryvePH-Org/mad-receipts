import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { grokbotConfig, type Deps, type JobStore } from "./client";

/** Jobs kept in the database (server only). */
export function dbJobStore(admin = createAdminClient()): JobStore {
  return {
    async create(job) {
      const { error } = await admin.from("grokbot_jobs").insert({ id: job.id, action: job.action, request: job.request as Json, created_by: job.createdBy });
      if (error) throw new Error(/grokbot_jobs/.test(error.message) ? "This needs the latest database update (migration 25)." : "Could not record the job.");
    },
    async get(id) {
      const { data } = await admin.from("grokbot_jobs").select("id, action, status, result, error").eq("id", id).maybeSingle();
      return data ? { id: data.id, action: data.action, status: data.status as "sent" | "done" | "failed", result: data.result, error: data.error } : null;
    },
    async complete(id, result, ok, error) {
      const { data: row } = await admin.from("grokbot_jobs").select("status").eq("id", id).maybeSingle();
      if (!row) return "unknown";
      // a failure we recorded ourselves (unreachable) can still be superseded by a real answer; a real answer is final
      const { data: updated } = await admin.from("grokbot_jobs").update({ status: ok ? "done" : "failed", result: result as Json, error, completed_at: new Date().toISOString() }).eq("id", id).eq("status", "sent").select("id");
      return updated?.length ? "stored" : "already";
    },
  };
}

export const defaultGrokbotDeps = (): Deps => ({ store: dbJobStore(), config: grokbotConfig() });
