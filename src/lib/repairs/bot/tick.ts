import "server-only";
import { manilaToday, daysBetween } from "@/lib/dates";
import { docsDb } from "@/lib/docsbible/review-server";
import { tell } from "@/lib/notify";
import { esc, failedKeyboard, renderReminder, approvalKeyboard, type OpenLine } from "./cards";
import type { Draft } from "./draft";
import { realPorts } from "./runtime";
import { tr } from "./texts";

// What runs by itself every few minutes (with the app's scheduled job): reminders of overdue jobs in the group, a nudge for reports waiting for approval,
// and the sweep of reports that got stuck while being read (the server restarted or the model hung): they get a Try again button, nothing stays lost.

const REMIND_FROM = () => Number(process.env.REPAIRS_REMINDER_START_HOUR) || 8;
const REMIND_TO = () => Number(process.env.REPAIRS_REMINDER_END_HOUR) || 18;
const REMIND_EVERY = () => Number(process.env.REPAIRS_REMINDER_INTERVAL_HOURS) || 4;
export const STUCK_AFTER_MS = 3 * 60_000, NUDGE_AFTER_MS = 4 * 3_600_000;

/** The hours (Manila) when reminders go out: 8, 12, 16 by default. */
export const reminderHours = (start = 8, end = 18, every = 4): number[] => { const h: number[] = []; for (let x = start; x < end; x += Math.max(1, every)) h.push(x); return h; };

type Job = OpenLine & { key: string | null };

/** The overdue jobs, by car, leaving out the ones muted today. */
export function overdueByCar(jobs: Job[], today: string, muted: Set<string>): Map<string, (OpenLine & { daysLate: number })[]> {
  const out = new Map<string, (OpenLine & { daysLate: number })[]>();
  for (const j of jobs) {
    if (!j.overdue || muted.has(j.jobId) || !j.due) continue;
    (out.get(j.plate) ?? out.set(j.plate, []).get(j.plate)!).push({ ...j, daysLate: Math.max(1, daysBetween(j.due, today)) });
  }
  return out;
}

export async function repairsBotTick(now = new Date()): Promise<Record<string, unknown>> {
  if (!process.env.REPAIRS_TELEGRAM_BOT_TOKEN) return { skipped: "the repairs bot is not connected" };
  const ports = realPorts(), db = docsDb(), today = manilaToday(now);
  const hour = new Date(now.getTime() + 8 * 3_600_000).getUTCHours();
  const out: Record<string, unknown> = {};
  const GL = (await ports.store.groupLang()) ?? ports.defaultLang;

  // 1. reports stuck while being read
  const stuck = (await db.from("repair_bot_drafts").select("id, data").eq("state", "parsing").lt("updated_at", new Date(now.getTime() - STUCK_AFTER_MS).toISOString()).limit(20)).data ?? [];
  let swept = 0;
  for (const row of stuck) {
    const won = await ports.store.claim(row.id as string, ["parsing"], "failed");
    if (!won) continue;
    const L = (await ports.store.person(won.ownerId))?.lang ?? ports.defaultLang;
    await ports.tg.edit(won.chatId, won.cardId ?? 0, `❌ ${tr(L, "msg.read_failed", { why: esc(tr(L, "msg.restarted")), heard: esc(won.transcript.slice(0, 600)) })}`, failedKeyboard(won, L)).catch(() => undefined);
    swept++;
  }
  out.swept = swept;
  if (swept) await tell({ category: "system_alert", dedupe: `repairs-stuck:${today}:${hour}`, text: `⚠️ ${swept} repair report${swept === 1 ? "" : "s"} got stuck while being read. The repairman was given a Try again button.` });

  // 2. a report waiting for an Approver for hours: one nudge every 4 hours
  const waiting = (await db.from("repair_bot_drafts").select("id").eq("state", "pending").lt("updated_at", new Date(now.getTime() - NUDGE_AFTER_MS).toISOString()).limit(20)).data ?? [];
  let nudged = 0;
  for (const w of waiting) {
    const d = await ports.store.getDraft(w.id as string);
    if (!d || d.state !== "pending" || now.getTime() - Math.max(d.nudgedAt, d.pendingAt) < NUDGE_AFTER_MS) continue;
    const hours = Math.round((now.getTime() - d.pendingAt) / 3_600_000);
    const approvers = (await ports.store.approvers()).filter((a) => a.tgId !== d.ownerId).map((a) => `<a href="tg://user?id=${a.tgId}">${esc(a.name)}</a>`).join(" ");
    await ports.tg.send(ports.groupChatId, `${tr(GL, "nudge.text", { who: approvers, hours, label: esc(`${d.data?.plate ?? ""} ${d.data?.vehicle ?? ""}`.trim()), owner: esc(d.ownerName) })}`, { replyTo: d.approvalId, keyboard: approvalKeyboard(d, GL) }).catch(() => 0);
    d.nudgedAt = now.getTime(); await ports.store.saveDraft(d); nudged++;
  }
  out.nudged = nudged;

  // 3. overdue jobs, in the group, at the reminder hours (once per hour slot)
  if (reminderHours(REMIND_FROM(), REMIND_TO(), REMIND_EVERY()).includes(hour)) {
    const slot = `rem:${today}:${hour}`;
    const done = (await db.from("repair_bot_kv").select("value").eq("key", "last_reminder").maybeSingle()).data?.value;
    if (done !== slot) {
      await db.from("repair_bot_kv").upsert({ key: "last_reminder", value: slot });
      const muted = new Set(((await db.from("repair_bot_kv").select("key").like("key", "mute:%").eq("value", today)).data ?? []).map((r) => String(r.key).slice(5)));
      const cars = overdueByCar(await ports.openJobs(), today, muted);
      let sent = 0;
      for (const [plate, items] of [...cars.entries()].slice(0, 8)) {
        const owners = (await db.from("car_repairs").select("reported_tg, reported_by").in("id", items.map((i) => i.jobId))).data ?? [];
        const mentions = [...new Map(owners.filter((o) => o.reported_tg).map((o) => [o.reported_tg as number, `<a href="tg://user?id=${o.reported_tg}">${esc(o.reported_by)}</a>`])).values()].join(", ");
        const card = renderReminder(plate, items, GL, mentions);
        await ports.tg.send(ports.groupChatId, card.text, { keyboard: card.keyboard }).catch(() => 0); sent++;
      }
      if (cars.size > 8) await ports.tg.send(ports.groupChatId, tr(GL, "rem.more_cars", { n: cars.size - 8 })).catch(() => 0);
      out.reminded = sent;
    }
  }
  return out;
}

export type { Draft };
