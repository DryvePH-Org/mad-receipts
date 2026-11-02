import "server-only";

export interface TelegramClient {
  sendPhoto(photo: Uint8Array, caption: string): Promise<void>;
  sendMessage(text: string): Promise<void>;
}

/** Telegram Bot API with plain fetch. Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID. */
export function createTelegramClient(): TelegramClient {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error("Telegram is not configured (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)");

  async function call(method: string, body: FormData) {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", body });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    // The token is part of the URL, so never include the URL in errors.
    if (!json?.ok) throw new Error(`Telegram ${method} failed: ${json?.description ?? `HTTP ${res.status}`}`);
  }

  return {
    async sendPhoto(photo, caption) {
      const form = new FormData();
      form.set("chat_id", chatId);
      form.set("caption", caption.slice(0, 1024)); // Telegram's caption limit
      form.set("photo", new Blob([new Uint8Array(photo)], { type: "image/jpeg" }), "receipt.jpg");
      await call("sendPhoto", form);
    },
    async sendMessage(text) {
      const form = new FormData();
      form.set("chat_id", chatId);
      form.set("text", text.slice(0, 4096));
      await call("sendMessage", form);
    },
  };
}
