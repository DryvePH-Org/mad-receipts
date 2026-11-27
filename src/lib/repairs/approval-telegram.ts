import "server-only";
import { docsDb } from "@/lib/docsbible/review-server";
import { sendWithButtons } from "@/lib/notify/bot";
import { notifyDb } from "@/lib/notify/store";
import { editsCars, roleFromDb } from "@/lib/roles";
import { announceWebDecision } from "./bot/runtime";
import { parseAskCallback } from "./chain";
import { decideRepairs } from "./server";

// What happens when someone presses a button on a repair approval message in Telegram (or answers the "why reject" question).
// The decision is the same one the Repairs page makes (decideRepairs), made as the person the message was sent to.

interface Ask { id: string; report_id: string; user_id: string; chat_id: number; closed_at: string | null }

async function person(userId: string): Promise<{ name: string; canDecide: boolean } | null> {
  const { data } = await notifyDb().from("profiles").select("full_name, role").eq("id", userId).maybeSingle();
  return data ? { name: (data.full_name as string | null)?.trim() || "Approver", canDecide: editsCars(roleFromDb(data.role)) } : null;
}

async function waitingJobs(reportId: string): Promise<string[]> {
  const { data } = await docsDb().from("car_repairs").select("id").eq("report_id", reportId).eq("approval", "pending");
  return (data ?? []).map((r) => r.id as string);
}

/** A button was pressed. Returns the little message Telegram shows the person. */
export async function answerButton(data: string | undefined, chatId: number): Promise<string> {
  const cb = parseAskCallback(data);
  if (!cb) return "That button is not valid.";
  const db = notifyDb();
  const { data: row } = await db.from("repair_approval_asks").select("id, report_id, user_id, chat_id, closed_at").eq("id", cb.askId).maybeSingle();
  const ask = row as Ask | null;
  if (!ask || Number(ask.chat_id) !== chatId) return "That request was not sent to you.";
  const me = await person(ask.user_id);
  if (!me?.canDecide) return "You cannot decide on repairs.";
  const ids = ask.closed_at ? [] : await waitingJobs(ask.report_id);
  if (!ids.length) { await db.from("repair_approval_asks").update({ closed_at: new Date().toISOString() }).eq("id", ask.id).is("closed_at", null); return "Someone already decided this report."; }

  if (cb.action === "no") {
    const promptId = await sendWithButtons(chatId, "Type the reason for rejecting, as a reply to this message.", { force_reply: true, input_field_placeholder: "Reason" });
    await db.from("repair_approval_asks").update({ prompt_id: promptId }).eq("id", ask.id);
    return "Type the reason.";
  }
  const r = await decideRepairs(ids, true, "", { name: me.name, userId: ask.user_id }, cb.action === "okd");
  if (!r.ok) return r.error;
  await announceWebDecision(ids, true, "", me.name);
  return cb.action === "okd" ? "Approved. The car can still be displayed." : "Approved.";
}

/** The reply to "why reject": rejects the report with that reason. Returns what to tell the person, or null when the message is not an answer to a question. */
export async function answerReason(chatId: number, replyToMessageId: number | undefined, text: string): Promise<string | null> {
  if (!replyToMessageId) return null;
  const db = notifyDb();
  const { data: row } = await db.from("repair_approval_asks").select("id, report_id, user_id, chat_id, closed_at").eq("chat_id", chatId).eq("prompt_id", replyToMessageId).maybeSingle();
  const ask = row as Ask | null;
  if (!ask) return null;
  const reason = text.trim().slice(0, 280);
  if (!reason) return "Type the reason in words, as a reply to my question.";
  const me = await person(ask.user_id);
  if (!me?.canDecide) return "You cannot decide on repairs.";
  const ids = ask.closed_at ? [] : await waitingJobs(ask.report_id);
  if (!ids.length) return "Someone already decided this report.";
  const r = await decideRepairs(ids, false, reason, { name: me.name, userId: ask.user_id });
  if (!r.ok) return r.error;
  await announceWebDecision(ids, false, reason, me.name);
  return "Rejected. The reporter will see your reason.";
}
