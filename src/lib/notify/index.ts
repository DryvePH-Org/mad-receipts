import "server-only";
import type { Role } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTo, TelegramError } from "./bot";
import { categoryById } from "./categories";
import { sendAfter } from "./quiet";
import { allLinks, noteLinkError, notifyDb } from "./store";

export const appUrl = (path = ""): string => `${(process.env.APP_URL || process.env.APP_BASE_URL || "https://mad.dryveph.io").replace(/\/$/, "")}${path}`;

export interface NotifyInput {
  category: string;
  text: string;
  /** Only these people (Sales: the owner of the deal). Without it: everyone whose role the category is for. */
  userIds?: readonly string[];
  /** Not this person (they did it themselves). */
  except?: string | null;
  /** A message with the same key (per person) is never sent twice: "money:2026-11-19". */
  dedupe?: string;
  now?: Date;
}
export interface NotifyResult { sent: number; held: number; skipped: number }

const MAX_TRIES = 5;

/** Who gets it: connected people of the right role, who have not muted this category. */
async function recipients(category: string, roles: readonly Role[], only?: readonly string[]) {
  const links = await allLinks();
  if (!links.length) return [];
  const ids = links.map((l) => l.userId).filter((id) => !only || only.includes(id));
  if (!ids.length) return [];
  const db = notifyDb();
  const [{ data: profiles }, { data: muted }] = await Promise.all([
    db.from("profiles").select("id, role").in("id", ids),
    db.from("notify_prefs").select("user_id").eq("category", category).eq("enabled", false).in("user_id", ids),
  ]);
  const off = new Set((muted ?? []).map((m) => String(m.user_id)));
  const roleOf = new Map((profiles ?? []).map((p) => [String(p.id), p.role as Role]));
  return links.filter((l) => ids.includes(l.userId) && !off.has(l.userId) && roles.includes(roleOf.get(l.userId) as Role));
}

async function deliver(row: { id: string; user_id: string; body: string; attempts: number }, chatId: number): Promise<boolean> {
  const db = notifyDb();
  try {
    await sendTo(chatId, row.body);
    await db.from("notify_outbox").update({ sent_at: new Date().toISOString(), attempts: row.attempts + 1, error: null }).eq("id", row.id);
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    const gone = e instanceof TelegramError && e.gone;
    await db.from("notify_outbox").update({ attempts: gone ? MAX_TRIES : row.attempts + 1, error: message.slice(0, 300) }).eq("id", row.id);
    if (gone) await noteLinkError(row.user_id, "The chat is closed or the bot was blocked. Connect Telegram again.");
    return false;
  }
}

/** Sends one message to the people it is for: now, or at 07:00 when it is quiet hours (urgent ones never wait). */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const cat = categoryById(input.category);
  if (!cat) throw new Error(`Unknown notification category: ${input.category}`);
  const now = input.now ?? new Date();
  const people = (await recipients(cat.id, cat.roles, input.userIds)).filter((p) => p.userId !== input.except);
  const out: NotifyResult = { sent: 0, held: 0, skipped: 0 };
  const db = notifyDb();
  for (const p of people) {
    const when = cat.urgent ? now : sendAfter(now);
    const { data: row, error } = await db.from("notify_outbox").insert({ user_id: p.userId, category: cat.id, body: input.text.slice(0, 4096), dedupe_key: input.dedupe ?? null, send_after: when.toISOString() }).select("id, user_id, body, attempts").single();
    if (error || !row) { out.skipped++; continue; } // already sent (same dedupe key) or could not be saved
    if (when.getTime() > now.getTime()) { out.held++; continue; }
    if (await deliver(row as { id: string; user_id: string; body: string; attempts: number }, p.chatId)) out.sent++; else out.skipped++;
  }
  return out;
}

/** The same, but a failure is only logged: a message that cannot be sent must never stop the work that caused it. */
export async function tell(input: NotifyInput): Promise<void> {
  try { await notify(input); } catch (e) { console.warn(`[notify] ${input.category} not sent: ${e instanceof Error ? e.message : "unknown"}`); }
}

/** Sends what was held for quiet hours and retries what failed (called every 5 minutes). */
export async function flushOutbox(now = new Date()): Promise<{ sent: number; failed: number }> {
  const db = notifyDb();
  const { data: due } = await db.from("notify_outbox").select("id, user_id, body, attempts").is("sent_at", null).lt("attempts", MAX_TRIES).lte("send_after", now.toISOString()).order("send_after").limit(60);
  if (!due?.length) return { sent: 0, failed: 0 };
  const chat = new Map((await allLinks()).map((l) => [l.userId, l.chatId]));
  let sent = 0, failed = 0;
  for (const r of due as { id: string; user_id: string; body: string; attempts: number }[]) {
    const chatId = chat.get(r.user_id);
    if (!chatId) { await db.from("notify_outbox").update({ attempts: MAX_TRIES, error: "Not connected." }).eq("id", r.id); failed++; continue; }
    if (await deliver(r, chatId)) sent++; else failed++;
  }
  return { sent, failed };
}

/** The profile name of a user, for messages ("Maria added a car"). */
export async function nameOf(userId: string | null | undefined): Promise<string> {
  if (!userId) return "Someone";
  const { data } = await createAdminClient().from("profiles").select("full_name").eq("id", userId).maybeSingle();
  return data?.full_name?.trim() || "Someone";
}
