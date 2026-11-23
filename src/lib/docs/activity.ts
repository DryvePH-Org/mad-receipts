import "server-only";
import { normalizePlate } from "@/lib/rules/plate";
import { createAdminClient } from "@/lib/supabase/admin";
import { describeActivity, type ActivityEntry } from "./activity-text";

/** What people did on this car's documents, newest first: the audit log entries that carry the plate, with the person's name. */
export async function loadCarActivity(plate: string, limit = 60): Promise<ActivityEntry[]> {
  const admin = createAdminClient();
  const key = normalizePlate(plate);
  const { data } = await admin.from("audit_logs").select("id, actor_id, action, after, created_at").eq("after->>plate", key).order("created_at", { ascending: false }).limit(limit);
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x))];
  const { data: people } = ids.length ? await admin.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const name = new Map((people ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? "Someone"]));
  return rows.map((r) => ({ id: r.id as string, at: r.created_at as string, who: r.actor_id ? name.get(r.actor_id as string) ?? "Someone" : "The system", text: describeActivity(r.action as string, r.after) }));
}
