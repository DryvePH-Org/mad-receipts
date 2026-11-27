import "server-only";
import { docsDb } from "@/lib/docsbible/review-server";
import { appUrl } from "@/lib/notify";
import { editTo, sendWithButtons } from "@/lib/notify/bot";
import { isQuiet } from "@/lib/notify/quiet";
import { allLinks, notifyDb } from "@/lib/notify/store";
import { editsCars, roleFromDb } from "@/lib/roles";
import { askButtons, askText, decidedText, DEFAULT_WAIT_MINUTES, isDue, MAX_ASKS, pickNext, REPAIR_TOPIC, waitFor, type ChainPerson } from "./chain";

// Who is asked to approve a repair report on Telegram, in what order, and when the next person is asked (the Super Admin sets it on the Repairs page).
// The ask is a message from the MAD Notification bot with Approve / Reject buttons. Every 5 minutes the scheduled job asks the next person for any report still waiting.

export async function loadChain(): Promise<ChainPerson[]> {
  const db = notifyDb();
  const { data } = await db.from("escalation_chain").select("user_id, position, wait_minutes").eq("topic", REPAIR_TOPIC).order("position");
  if (!data?.length) return [];
  const ids = data.map((r) => String(r.user_id));
  const [{ data: profiles }, links] = await Promise.all([db.from("profiles").select("id, full_name, role").in("id", ids), allLinks()]);
  const name = new Map((profiles ?? []).map((p) => [String(p.id), (p.full_name as string | null)?.trim() || "Someone"]));
  const role = new Map((profiles ?? []).map((p) => [String(p.id), roleFromDb(p.role)]));
  const chat = new Map(links.map((l) => [l.userId, l.chatId]));
  return data.filter((r) => role.has(String(r.user_id)) && editsCars(role.get(String(r.user_id))!)).map((r) => ({ userId: String(r.user_id), name: name.get(String(r.user_id)) ?? "Someone", position: Number(r.position), waitMinutes: Number(r.wait_minutes) || DEFAULT_WAIT_MINUTES, chatId: chat.get(String(r.user_id)) ?? null }));
}

/** Replaces the chain: the people in order, each with the minutes they have before the next one is asked. */
export async function saveChain(rows: { userId: string; waitMinutes: number }[]): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = notifyDb();
  const ids = rows.map((r) => r.userId);
  if (new Set(ids).size !== ids.length) return { ok: false, error: "A person is in the list twice." };
  if (ids.length) {
    const { data } = await db.from("profiles").select("id, role").in("id", ids);
    if ((data ?? []).length !== ids.length || (data ?? []).some((p) => !editsCars(roleFromDb(p.role)))) return { ok: false, error: "Only the Super Admin, the Admins and Sales can approve repairs." };
  }
  const del = await db.from("escalation_chain").delete().eq("topic", REPAIR_TOPIC);
  if (del.error) return { ok: false, error: `Could not save: ${del.error.message}` };
  if (rows.length) {
    const ins = await db.from("escalation_chain").insert(rows.map((r, i) => ({ topic: REPAIR_TOPIC, user_id: r.userId, position: i + 1, wait_minutes: Math.min(1440, Math.max(5, Math.round(r.waitMinutes) || DEFAULT_WAIT_MINUTES)) })));
    if (ins.error) return { ok: false, error: `Could not save: ${ins.error.message}` };
  }
  return { ok: true };
}

interface PendingReport { reportId: string; plate: string; vehicle: string | null; problems: string[]; reportedBy: string | null }

async function pendingReports(): Promise<PendingReport[]> {
  const { data } = await docsDb().from("car_repairs").select("report_id, plate_no, vehicle, problem, reported_by").eq("approval", "pending").not("report_id", "is", null).order("created_at").limit(200);
  const by = new Map<string, PendingReport>();
  for (const r of data ?? []) {
    const id = String(r.report_id);
    const have = by.get(id) ?? { reportId: id, plate: String(r.plate_no), vehicle: (r.vehicle as string | null) ?? null, problems: [], reportedBy: (r.reported_by as string | null) ?? null };
    if (r.problem) have.problems.push(String(r.problem));
    by.set(id, have);
  }
  return [...by.values()];
}

/** Asks the first person of the chain for every new report, and the next person for every report nobody decided in time. Not during quiet hours (21:00 to 07:00). */
export async function escalateRepairApprovals(now = new Date()): Promise<Record<string, unknown>> {
  const chain = await loadChain();
  if (!chain.length) return { skipped: "no chain is set" };
  if (isQuiet(now)) return { skipped: "quiet hours" };
  const db = notifyDb();
  let asked = 0;
  for (const rep of (await pendingReports()).slice(0, 25)) {
    const { data: asks } = await db.from("repair_approval_asks").select("level, user_id, sent_at").eq("report_id", rep.reportId).order("level", { ascending: false }).limit(1);
    const last = asks?.[0];
    if (last && (Number(last.level) >= MAX_ASKS || !isDue(new Date(String(last.sent_at)), waitFor(chain, String(last.user_id)), now))) continue;
    const level = last ? Number(last.level) + 1 : 1;
    const next = pickNext(chain, last ? String(last.user_id) : null);
    if (!next || next.chatId === null) continue;
    // claim the level first, so two runs at the same time never ask twice
    const text = askText(rep, level, next.waitMinutes, next.name);
    const claim = await db.from("repair_approval_asks").insert({ report_id: rep.reportId, level, user_id: next.userId, chat_id: next.chatId, body: text }).select("id").single();
    if (claim.error || !claim.data) continue;
    try {
      const messageId = await sendWithButtons(next.chatId, text, askButtons(String(claim.data.id), appUrl("/repairs")));
      await db.from("repair_approval_asks").update({ message_id: messageId }).eq("id", claim.data.id);
      asked++;
    } catch (e) {
      console.warn(`[repair-chain] could not ask ${next.name}: ${e instanceof Error ? e.message : "unknown"}`);
      await db.from("repair_approval_asks").update({ closed_at: new Date().toISOString() }).eq("id", claim.data.id); // counts as asked, so the next person is tried at the next run
    }
  }
  return { asked };
}

/** The report was decided (on Telegram, in the app or in the group): every open ask is closed and its message shows who decided. Never throws. */
export async function closeAsks(jobIds: string[], approve: boolean, by: string, reason: string): Promise<void> {
  try {
    const { data: jobs } = await docsDb().from("car_repairs").select("report_id").in("id", jobIds);
    const reports = [...new Set((jobs ?? []).map((j) => j.report_id as string | null).filter((x): x is string => !!x))];
    if (!reports.length) return;
    const db = notifyDb();
    const { data: open } = await db.from("repair_approval_asks").select("id, report_id, chat_id, message_id, body").in("report_id", reports).is("closed_at", null);
    if (!open?.length) return;
    await db.from("repair_approval_asks").update({ closed_at: new Date().toISOString() }).in("id", open.map((o) => o.id as string));
    for (const o of open) {
      if (!o.message_id) continue;
      await editTo(Number(o.chat_id), Number(o.message_id), decidedText(String(o.body ?? "🔧 Repair report"), approve, by, reason)).catch(() => undefined);
    }
  } catch (e) { console.warn(`[repair-chain] could not close the asks: ${e instanceof Error ? e.message : "unknown"}`); }
}

