"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireSuper, requireUser } from "@/lib/auth";
import { botName, botToken, sendTo, setWebhook, webhookInfo } from "@/lib/notify/bot";
import { categoriesForRole } from "@/lib/notify/categories";
import { appUrl } from "@/lib/notify";
import { makeLinkToken, webhookSecret } from "@/lib/notify/link";
import { getLink, removeLink, setCategory } from "@/lib/notify/store";

export type Result = { ok: true; message: string; url?: string; bot?: string; command?: string } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong." });

/** The link that opens the bot with this person's one-time token. */
export async function connectLinkAction(): Promise<Result> {
  const user = await requireUser();
  const token = botToken();
  if (!token) return { ok: false, error: "Telegram is not set up on the server yet. Tell the Admin." };
  try {
    const info = await webhookInfo();
    if (!info.url) return { ok: false, error: "The Admin has to press “Set up the bot” first (below, Admin only)." };
    const bot = await botName(), code = makeLinkToken(token, user.id);
    // the link opens the bot with the code; the same code typed by hand (/start <code>) works when a phone or a browser does not open the link
    return { ok: true, message: "Open Telegram and press Start.", url: `https://t.me/${bot}?start=${code}`, bot, command: `/start ${code}` };
  } catch (e) { return fail(e); }
}

export async function disconnectAction(): Promise<Result> {
  const user = await requireUser();
  await removeLink(user.id);
  revalidatePath("/telegram");
  return { ok: true, message: "Disconnected." };
}

export async function setCategoryAction(category: string, enabled: boolean): Promise<Result> {
  const user = await requireUser();
  if (!categoriesForRole(user.role).some((c) => c.id === category)) return { ok: false, error: "That message is not for your role." };
  try { await setCategory(user.id, category, enabled); } catch (e) { return fail(e); }
  revalidatePath("/telegram");
  return { ok: true, message: "Saved." };
}

export async function sendTestAction(): Promise<Result> {
  const user = await requireUser();
  const link = await getLink(user.id);
  if (!link) return { ok: false, error: "Connect Telegram first." };
  try { await sendTo(link.chatId, `✅ Test from MAD. This is how your messages will look.\n${appUrl("/")}`); } catch (e) { return fail(e); }
  return { ok: true, message: "Sent. Look at Telegram." };
}

/** Admin: tells Telegram to send the bot's messages to this app. Refuses when the bot already feeds another program. */
export async function setUpBotAction(): Promise<Result> {
  await requireSuper();
  const token = botToken();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN is not set on the server." };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const url = `${host && !host.startsWith("localhost") ? `https://${host}` : appUrl()}/api/telegram/webhook`;
  try {
    const now = await webhookInfo();
    if (now.url && now.url !== url) return { ok: false, error: `This bot already sends its messages to another address (${new URL(now.url).host}). Setting it here would stop that. Create a second bot in BotFather for MAD and put its token in TELEGRAM_USER_BOT_TOKEN on the server.` };
    await setWebhook(url, webhookSecret(token));
  } catch (e) { return fail(e); }
  revalidatePath("/telegram");
  return { ok: true, message: "The bot is set up. Everyone can connect now." };
}
