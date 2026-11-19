import "server-only";
import { createHmac } from "node:crypto";
import type { Keyboard } from "./cards";
import type { Tg } from "./ports";

// The repairs bot's own Telegram bot (REPAIRS_TELEGRAM_BOT_TOKEN). The token is part of the address, so it never goes into an error.
export const repairsToken = (): string | null => process.env.REPAIRS_TELEGRAM_BOT_TOKEN || null;
export const repairsGroupId = (): number => Number(process.env.REPAIRS_TELEGRAM_CHAT_ID) || 0;
/** The secret Telegram sends back with every update, derived from the token (nothing more to set up). */
export const repairsWebhookSecret = (token: string): string => createHmac("sha256", token).update("mad-repairs-webhook").digest("hex").slice(0, 48);

async function api<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = repairsToken();
  if (!token) throw new Error("The repairs bot is not set up (REPAIRS_TELEGRAM_BOT_TOKEN).");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!json?.ok) throw new Error(`Telegram ${method} failed: ${json?.description ?? `HTTP ${res.status}`}`);
  return json.result as T;
}

export const telegram: Tg = {
  async send(chatId, text, opts) {
    const r = await api<{ message_id: number }>("sendMessage", { chat_id: chatId, text: text.slice(0, 4096), parse_mode: "HTML", disable_web_page_preview: true, ...(opts?.replyTo ? { reply_parameters: { message_id: opts.replyTo, allow_sending_without_reply: true } } : {}), ...(opts?.keyboard ? { reply_markup: opts.keyboard satisfies Keyboard } : {}) });
    return r.message_id;
  },
  async edit(chatId, messageId, text, keyboard) {
    try { await api("editMessageText", { chat_id: chatId, message_id: messageId, text: text.slice(0, 4096), parse_mode: "HTML", disable_web_page_preview: true, reply_markup: keyboard ?? { inline_keyboard: [] } }); }
    catch (e) { if (!/not modified/i.test(e instanceof Error ? e.message : "")) throw e; }
  },
  async answer(callbackId, text, alert) { await api("answerCallbackQuery", { callback_query_id: callbackId, ...(text ? { text: text.slice(0, 190) } : {}), ...(alert ? { show_alert: true } : {}) }); },
  async remove(chatId, messageId) { await api("deleteMessage", { chat_id: chatId, message_id: messageId }); },
};

export const setRepairsWebhook = (url: string) => api("setWebhook", { url, secret_token: repairsWebhookSecret(repairsToken()!), allowed_updates: ["message", "callback_query"] });
export const repairsWebhookInfo = () => api<{ url: string; pending_update_count?: number; last_error_message?: string }>("getWebhookInfo", {});
