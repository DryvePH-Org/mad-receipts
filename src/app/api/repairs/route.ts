import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { isOpen } from "@/lib/repairs/model";
import { decideRepairs, loadRepairs, reportRepairs, updateRepair } from "@/lib/repairs/server";
import { normalizePlate } from "@/lib/rules/plate";
import { docsDb } from "@/lib/docsbible/review-server";

// The connection for the repairs bot (Telegram): the bot sends what the repairmen said and what the approvers pressed, and reads the open jobs.
// It authenticates with REPAIRS_BOT_TOKEN (its own secret, separate from CRON_SECRET). The decisions of a person are made by the bot's own list of
// approvers (as before); in the app the Approver decides on the Repairs page. Nothing is written to a Google sheet.

function authorized(request: Request): boolean {
  const secret = process.env.REPAIRS_BOT_TOKEN;
  if (!secret) return false;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

const who = z.object({ by: z.string().min(1).max(80), tg: z.number().int().optional() });
const item = z.object({ problem: z.string().max(300), reportedOn: z.string().max(10).optional(), solution: z.string().max(300).optional(), supplier: z.string().max(100).optional(), company: z.string().max(100).optional(), estTimeline: z.string().max(40).optional(), status: z.string().max(20).optional() });
const body = z.discriminatedUnion("action", [
  who.extend({ action: z.literal("report"), reportId: z.string().max(60).optional(), plate: z.string().max(20), vehicle: z.string().max(80).optional(), ym: z.string().max(4).optional(), items: z.array(item).min(1).max(10) }),
  who.extend({ action: z.literal("update"), key: z.string().max(100), status: z.string().max(20).optional(), estTimeline: z.string().max(40).optional(), supplier: z.string().max(100).optional(), company: z.string().max(100).optional(), note: z.string().max(200).optional() }),
  who.extend({ action: z.literal("decide"), reportId: z.string().max(60), approve: z.boolean(), reason: z.string().max(280).optional() }),
]);

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const plate = normalizePlate(new URL(request.url).searchParams.get("plate"));
  const open = (await loadRepairs(plate || undefined)).filter(isOpen).slice(0, 100);
  return Response.json({ ok: true, open: open.map((r) => ({ key: r.key, plate: r.plate, year_model: r.ym ?? "", vehicle: r.vehicle ?? r.brand ?? "", problem: r.problem ?? "", supplier: r.supplier ?? "", est_timeline: r.dueOn ?? r.estTimeline ?? "", status: r.status ?? "" })), skipped_without_id: 0 });
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const p = body.safeParse(await request.json().catch(() => null));
  if (!p.success) return Response.json({ ok: false, error: "The request is not valid." }, { status: 422 }); // 4xx: Cloudflare hides the body of a 5xx
  const d = p.data, by = { name: d.by };
  if (d.action === "report") {
    const r = await reportRepairs({ plate: d.plate, vehicle: d.vehicle, ym: d.ym, items: d.items, reportId: d.reportId, reportedBy: d.by, reportedTg: d.tg ?? null, source: "bot" }, by);
    return Response.json(r, { status: r.ok ? 200 : 422 });
  }
  const db = docsDb();
  if (d.action === "update") {
    const { data: job } = await db.from("car_repairs").select("id").eq("key", d.key).maybeSingle();
    if (!job) return Response.json({ ok: false, error: "No job has that key." }, { status: 422 });
    const r = await updateRepair(job.id as string, { status: d.status, estTimeline: d.estTimeline, supplier: d.supplier, company: d.company, note: d.note }, by);
    return Response.json(r, { status: r.ok ? 200 : 422 });
  }
  const { data: jobs } = await db.from("car_repairs").select("id").eq("report_id", d.reportId);
  const r = await decideRepairs((jobs ?? []).map((j) => j.id as string), d.approve, d.reason ?? "", by);
  return Response.json(r, { status: r.ok ? 200 : 422 });
}
