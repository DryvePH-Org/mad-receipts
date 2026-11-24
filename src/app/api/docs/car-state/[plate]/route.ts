import { createHash } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { docsDb } from "@/lib/docsbible/review-server";
import { normalizePlate } from "@/lib/rules/plate";

/**
 * A short fingerprint of everything the car's page shows (the photos and what was read, the case, the approval, the details, the Docs Bible row,
 * the bot's jobs). The page asks every few seconds and reloads itself when the fingerprint changed, so one person's correction shows up for the others.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ plate: string }> }) {
  const user = await getCurrentUser();
  if (!user || !user.modules.includes("register")) return new Response("Not allowed", { status: 403 });
  const key = normalizePlate((await ctx.params).plate);
  if (!/^[A-Z0-9]{3,12}$/.test(key)) return new Response("Not found", { status: 404 });
  const db = docsDb();
  const [files, folder, flow, details, unit, jobs, transfers] = await Promise.all([
    db.from("folder_files").select("id, read_status, doc_types, doc_types_source, flags, details, duplicate_of").eq("plate_no", key).order("id"),
    db.from("unit_folders").select("case_type, case_source, location, match_status, folder_id, deal_id").eq("plate_no", key).maybeSingle(),
    db.from("unit_workflow").select("*").eq("plate_no", key).maybeSingle(),
    db.from("unit_details").select("data").eq("plate_no", key).maybeSingle(),
    db.from("docs_units_current").select("*").eq("plate_no", key).maybeSingle(),
    db.from("grokbot_jobs").select("id, status").eq("plate_no", key).in("status", ["queued", "sent"]).order("id"),
    db.from("car_sales").select("id, stage, handed_off_at, back_at, released_on, delivered_on, updated_at").eq("plate_no", key).order("id"),
  ]);
  const version = createHash("sha1").update(JSON.stringify([files.data, folder.data, flow.data, details.data, unit.data, jobs.data, transfers.data])).digest("hex").slice(0, 16);
  return Response.json({ version }, { headers: { "Cache-Control": "no-store" } });
}
