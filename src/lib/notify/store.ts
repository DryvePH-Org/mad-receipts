import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// The new tables are not in the generated types yet, so this is the untyped client (like the Docs Bible).
export const notifyDb = (): SupabaseClient => createAdminClient() as unknown as SupabaseClient;

export interface TelegramLink { userId: string; chatId: number; username: string | null; connectedAt: string; lastError: string | null }
const toLink = (r: Record<string, unknown>): TelegramLink => ({ userId: String(r.user_id), chatId: Number(r.chat_id), username: (r.username as string | null) ?? null, connectedAt: String(r.connected_at), lastError: (r.last_error as string | null) ?? null });

export async function getLink(userId: string): Promise<TelegramLink | null> {
  const { data } = await notifyDb().from("telegram_links").select("*").eq("user_id", userId).maybeSingle();
  return data ? toLink(data) : null;
}

export async function allLinks(): Promise<TelegramLink[]> {
  const { data } = await notifyDb().from("telegram_links").select("*").limit(2000);
  return (data ?? []).map(toLink);
}

/** One chat belongs to one person: connecting a chat that another account holds moves it. */
export async function saveLink(userId: string, chatId: number, username: string | null): Promise<void> {
  const db = notifyDb();
  await db.from("telegram_links").delete().eq("chat_id", chatId);
  const { error } = await db.from("telegram_links").upsert({ user_id: userId, chat_id: chatId, username, connected_at: new Date().toISOString(), last_error: null, last_error_at: null }, { onConflict: "user_id" });
  if (error) throw new Error(`Could not save the Telegram connection: ${error.message}`);
}

export async function removeLinkOfChat(chatId: number): Promise<string | null> {
  const { data } = await notifyDb().from("telegram_links").delete().eq("chat_id", chatId).select("user_id");
  return (data?.[0]?.user_id as string | undefined) ?? null;
}

export async function removeLink(userId: string): Promise<void> {
  await notifyDb().from("telegram_links").delete().eq("user_id", userId);
}

export async function noteLinkError(userId: string, error: string): Promise<void> {
  await notifyDb().from("telegram_links").update({ last_error: error.slice(0, 300), last_error_at: new Date().toISOString() }).eq("user_id", userId);
}

/** The categories this person switched off. */
export async function mutedCategories(userId: string): Promise<Set<string>> {
  const { data } = await notifyDb().from("notify_prefs").select("category").eq("user_id", userId).eq("enabled", false);
  return new Set((data ?? []).map((r) => String(r.category)));
}

export async function setCategory(userId: string, category: string, enabled: boolean): Promise<void> {
  const { error } = await notifyDb().from("notify_prefs").upsert({ user_id: userId, category, enabled }, { onConflict: "user_id,category" });
  if (error) throw new Error(`Could not save: ${error.message}`);
}
