import "server-only";

/** The Telegram bot for personal messages. TELEGRAM_USER_BOT_TOKEN when set (a bot of its own), else the bot the group messages use. */
export const botToken = (): string | null => process.env.TELEGRAM_USER_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || null;

export class TelegramError extends Error {
  constructor(message: string, readonly code: number | null) { super(message); }
  /** The person blocked the bot or deleted the chat: sending again will not work until they connect again. */
  get gone() { return this.code === 403 || (this.code === 400 && /chat not found/i.test(this.message)); }
}

async function api<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const token = botToken();
  if (!token) throw new TelegramError("Telegram is not set up (TELEGRAM_BOT_TOKEN).", null);
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(15_000) });
  const json = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string; error_code?: number } | null;
  // the token is part of the URL, so it never goes into an error
  if (!json?.ok) throw new TelegramError(`Telegram ${method} failed: ${json?.description ?? `HTTP ${res.status}`}`, json?.error_code ?? res.status);
  return json.result as T;
}

export const sendTo = (chatId: number | string, text: string) => api("sendMessage", { chat_id: chatId, text: text.slice(0, 4096), disable_web_page_preview: true });
export const botName = async (): Promise<string> => (await api<{ username: string }>("getMe")).username;
export const webhookInfo = () => api<{ url: string; last_error_message?: string }>("getWebhookInfo");
export const setWebhook = (url: string, secret: string) => api("setWebhook", { url, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true });
