import "server-only";
import { formatDate, manilaToday } from "@/lib/dates";
import { allReminders } from "@/lib/data";
import { centsOf } from "@/lib/deal/status";
import { pesos } from "@/lib/deals";
import { loadCar } from "@/lib/docs/service";
import { listSavedCopies } from "@/lib/docsbible/export-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { announceToday, orLabel, orStatus } from "@/lib/docsbible/or-expiry";
import { daysBetween } from "@/lib/dates";
import { digestText, weeklyText, type DigestItem } from "./digests";
import { appUrl, flushOutbox, notify } from "./index";
import { notifyDb } from "./store";
import { isQuiet } from "./quiet";

const manila = (now: Date) => new Date(now.getTime() + 8 * 3_600_000);

/**
 * Everything that is scheduled, run every 5 minutes by the sync job. Each message carries a "once per day" key, so running it often
 * is harmless: a morning message goes out at the first run after its hour, and never twice.
 */
export async function runScheduled(now = new Date()): Promise<Record<string, unknown>> {
  const today = manilaToday(now), m = manila(now), hour = m.getUTCHours(), monday = m.getUTCDay() === 1;
  const out: Record<string, unknown> = {};
  const part = async (name: string, run: () => Promise<unknown>) => { try { out[name] = await run(); } catch (e) { out[name] = "failed"; console.error(`[notify] ${name} failed: ${e instanceof Error ? e.message : "unknown"}`); } };

  await part("outbox", () => flushOutbox(now));
  await part("alerts", () => problemAlerts(now, today, hour));
  if (isQuiet(now)) return out; // the morning messages wait for 7:00; they go at their own hour

  if (hour >= 8) {
    await part("money", () => moneyDigests(today));
    await part("soldPapers", () => soldPapersMissing(now, today));
    if (monday) await part("weekly", () => weekly(now, today));
  }
  if (hour >= 9) {
    await part("approvals", () => approvalDigest(today));
    await part("review", () => reviewDigest(today));
    await part("orRenewal", () => orDigest(today));
  }
  return out;
}

/** Sales: their own deals that are due, late, waiting for a lender or near a collateral date (what the Reminders page shows them). */
async function moneyDigests(today: string) {
  const { list } = await allReminders();
  const owners = new Map<string, DigestItem[]>();
  for (const n of list) if (n.audience.userId && n.icon !== "x" && n.icon !== "shield") owners.set(n.audience.userId, [...(owners.get(n.audience.userId) ?? []), { title: n.title, detail: n.detail }]);
  let sent = 0;
  for (const [userId, items] of owners) {
    const text = digestText("⏰ Your deals", today, items, appUrl("/reminders"));
    if (text) sent += (await notify({ category: "money_digest", userIds: [userId], dedupe: `money:${today}`, text })).sent;
  }
  return { people: owners.size, sent };
}

/** Approvers: receipts that waited longer than the limit in Settings. */
async function approvalDigest(today: string) {
  const { list } = await allReminders();
  const items = list.filter((n) => n.icon === "shield").map((n) => ({ title: n.title, detail: n.detail }));
  const text = digestText("🧾 Receipts waiting too long", today, items, appUrl("/approvals"));
  return text ? notify({ category: "approval_digest", dedupe: `approvals:${today}`, text }) : { sent: 0 };
}

/** Sales: the deal's AR was approved at least 2 days ago and a sold paper (signed AR, buyer's ID, deed) is still missing. Repeats every 3 days. */
async function soldPapersMissing(now: Date, today: string) {
  const admin = createAdminClient();
  const cutoff = new Date(now.getTime() - 2 * 86_400_000).toISOString();
  const { data: approved } = await admin.from("receipts").select("deal_id, reviewed_at").eq("status", "approved").lte("reviewed_at", cutoff).limit(1000);
  const dealIds = [...new Set((approved ?? []).map((r) => r.deal_id))];
  if (!dealIds.length) return { deals: 0 };
  const { data: deals } = await admin.from("deal_summaries").select("id, deal_no, buyer_name, created_by, units, status").in("id", dealIds.slice(0, 200)).eq("status", "open");
  const byOwner = new Map<string, DigestItem[]>();
  for (const d of deals ?? []) {
    for (const u of (Array.isArray(d.units) ? d.units : []) as { plate_no?: string; plate?: string; make_type?: string }[]) {
      const key = u.plate_no ?? u.plate;
      if (!key) continue;
      const car = await loadCar(key).catch(() => null);
      if (!car || car.folder.match_status !== "linked") continue;
      const missing = car.checklist.items.filter((i) => i.stage === "sold" && !i.present && !i.optional).map((i) => i.label);
      if (missing.length) byOwner.set(d.created_by, [...(byOwner.get(d.created_by) ?? []), { title: `${d.buyer_name} · ${u.make_type || u.plate || key}`, detail: `Still needed: ${missing.join(", ")}.` }]);
    }
  }
  const bucket = Math.floor(Date.parse(`${today}T00:00:00Z`) / (3 * 86_400_000));
  let sent = 0;
  for (const [userId, items] of byOwner) {
    const text = digestText("📄 Sold papers still missing", today, items, appUrl("/documents"));
    if (text) sent += (await notify({ category: "sold_papers_missing", userIds: [userId], dedupe: `soldmissing:${bucket}`, text })).sent;
  }
  return { owners: byOwner.size, sent };
}

/** Documentation: how many items are open on the Docs Bible review list. */
async function reviewDigest(today: string) {
  const { count } = await notifyDb().from("docs_review_items").select("id", { count: "exact", head: true }).eq("status", "open");
  if (!count) return { open: 0 };
  return notify({ category: "review_digest", dedupe: `review:${today}`, text: `⚠️ Docs Bible review list · ${formatDate(today)}\n${count} open ${count === 1 ? "item" : "items"} to look at (same plate twice, statuses that differ, rows to check).\n${appUrl("/docs-bible/review")}` });
}

/** Documentation: cars whose OR is 30, 14, 7 or 0 days from expiring, or late by a whole number of weeks. Works from the real date column (migration 37). */
async function orDigest(today: string) {
  // read the table (the "current" view was made before the new column existed and does not list it): the latest arrival of each plate
  const { data: all, error } = await notifyDb().from("docs_units").select("plate_no, plate_display, year_model, make, model_variant, or_expiry, sale_status, vehicle_status, arrival_date").is("archived_at", null).limit(5000);
  if (error) return { skipped: "the OR date column is not there yet" };
  const latest = new Map<string, NonNullable<typeof all>[number]>();
  for (const u of all ?? []) { const have = latest.get(String(u.plate_no)); if (!have || String(u.arrival_date ?? "") >= String(have.arrival_date ?? "")) latest.set(String(u.plate_no), u); }
  const data = [...latest.values()].filter((u) => !!u.or_expiry);
  const items = (data ?? [])
    .filter((u) => !/^sold$/i.test(String(u.sale_status ?? "")) && u.vehicle_status !== "SOLD")
    .map((u) => ({ u, days: daysBetween(today, String(u.or_expiry).slice(0, 10)) }))
    .filter((x) => announceToday(x.days))
    .sort((a, b) => a.days - b.days)
    .map(({ u }): DigestItem => ({ title: `${u.plate_display ?? u.plate_no} · ${[u.year_model, u.make, u.model_variant].filter(Boolean).join(" ")}`, detail: `${orLabel(orStatus(String(u.or_expiry).slice(0, 10), today))} (${String(u.or_expiry).slice(0, 10)})` }));
  const text = digestText("🪪 OR renewals", today, items, appUrl("/documents"));
  return text ? notify({ category: "or_renewal", dedupe: `or:${today}`, text }) : { sent: 0 };
}

/** Admin: Monday morning. */
async function weekly(now: Date, today: string) {
  const admin = createAdminClient(), db = notifyDb();
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [{ count: approved }, { count: rejected }, { data: pending }, { list, deals }, { count: reviewOpen }, { count: handed }, { count: unscanned }] = await Promise.all([
    admin.from("receipts").select("id", { count: "exact", head: true }).eq("status", "approved").gte("reviewed_at", since),
    admin.from("receipts").select("id", { count: "exact", head: true }).eq("status", "rejected").gte("reviewed_at", since),
    admin.from("receipts").select("submitted_at").eq("status", "pending").order("submitted_at").limit(500),
    allReminders(),
    db.from("docs_review_items").select("id", { count: "exact", head: true }).eq("status", "open"),
    admin.from("unit_workflow").select("plate_no", { count: "exact", head: true }).not("handoff_at", "is", null).is("handoff_returned_at", null),
    admin.from("folder_files").select("plate_no", { count: "exact", head: true }).eq("read_status", "pending"),
  ]);
  const overdue = list.filter((n) => n.key.startsWith("od-"));
  const overdueBalance = deals.filter((d) => overdue.some((n) => n.dealId === d.id)).reduce((sum, d) => sum + centsOf(d.balance / 100), 0);
  const oldest = pending?.[0]?.submitted_at ? Math.floor((now.getTime() - Date.parse(pending[0].submitted_at)) / 86_400_000) : null;
  return notify({ category: "weekly_summary", dedupe: `weekly:${today}`, text: weeklyText(today, { receiptsApproved: approved ?? 0, receiptsRejected: rejected ?? 0, receiptsPending: pending?.length ?? 0, oldestPendingDays: oldest, overdueDeals: overdue.length, overdueBalance: pesos(overdueBalance / 100), carsNeedScan: unscanned ?? 0, carsHandedOff: handed ?? 0, reviewOpen: reviewOpen ?? 0 }, appUrl("/dashboard")) });
}

/** Admin: something is broken. At most one message an hour per problem; these ignore quiet hours. */
async function problemAlerts(now: Date, today: string, hour: number) {
  const admin = createAdminClient();
  const hourKey = now.toISOString().slice(0, 13);
  const problems: { key: string; text: string }[] = [];

  const { count: failedSync } = await admin.from("sync_jobs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("updated_at", new Date(now.getTime() - 6 * 3_600_000).toISOString());
  if (failedSync) problems.push({ key: "sync", text: `🚨 ${failedSync} sync ${failedSync === 1 ? "job has" : "jobs have"} failed in the last 6 hours (Drive, Sheets, Telegram or inventory note).\nOpen Admin → Sync jobs to see why and retry.\n${appUrl("/admin/sync")}` });

  const stuckBefore = new Date(now.getTime() - 30 * 60_000).toISOString();
  const [{ count: stuckQueued }, { count: stuckSent }] = await Promise.all([
    admin.from("grokbot_jobs").select("id", { count: "exact", head: true }).eq("status", "queued").lte("created_at", stuckBefore),
    admin.from("grokbot_jobs").select("id", { count: "exact", head: true }).eq("status", "sent").lte("started_at", stuckBefore),
  ]);
  if (stuckQueued || stuckSent) problems.push({ key: "scanner", text: `🚨 The scanner looks stuck: ${stuckQueued ?? 0} scan(s) waiting and ${stuckSent ?? 0} sent for more than 30 minutes.\nCheck the bot and Admin → Sync jobs → Grokbot queue.\n${appUrl("/admin/sync")}` });

  if (hour >= 10) {
    const copies = await listSavedCopies().catch(() => null);
    if (copies && !copies.some((c) => c.name.includes(today))) problems.push({ key: "backup", text: `🚨 The daily Docs Bible backup for ${formatDate(today)} is missing.\nOpen Admin → Go-live check, or the Table → Download.\n${appUrl("/admin/golive")}` });
  }

  let sent = 0;
  for (const p of problems) sent += (await notify({ category: "system_alert", dedupe: `alert:${p.key}:${hourKey}`, text: p.text, now })).sent;
  return { problems: problems.length, sent };
}
