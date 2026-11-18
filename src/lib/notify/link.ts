import { createHmac, timingSafeEqual } from "node:crypto";

/** The one-time link a person follows to connect their Telegram: signed with a key made from the bot token, valid 30 minutes. Nothing is stored. */
const key = (token: string, purpose: string) => createHmac("sha256", token).update(`mad-notify:${purpose}`).digest();

export const LINK_MINUTES = 30;

export function makeLinkToken(botToken: string, userId: string, now = Date.now()): string {
  const id = userId.replace(/-/g, "");
  const exp = Math.floor(now / 60_000 + LINK_MINUTES).toString(36);
  const sig = createHmac("sha256", key(botToken, "link")).update(`${id}_${exp}`).digest("hex").slice(0, 16);
  return `${id}_${exp}_${sig}`; // letters, digits and "_" only: what Telegram allows after /start
}

/** The user the token was made for, or null when it is wrong, altered or expired. */
export function readLinkToken(botToken: string, token: string, now = Date.now()): string | null {
  const m = /^([0-9a-f]{32})_([0-9a-z]{1,8})_([0-9a-f]{16})$/.exec(token);
  if (!m) return null;
  const want = createHmac("sha256", key(botToken, "link")).update(`${m[1]}_${m[2]}`).digest("hex").slice(0, 16);
  if (!timingSafeEqual(Buffer.from(want), Buffer.from(m[3]))) return null;
  if (parseInt(m[2], 36) * 60_000 < now) return null;
  const h = m[1];
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** The secret Telegram sends back with every webhook call, so only Telegram can reach the webhook. */
export const webhookSecret = (botToken: string): string => createHmac("sha256", key(botToken, "webhook")).digest("hex").slice(0, 48);
