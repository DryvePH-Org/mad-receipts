import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { answerCallback, botToken, sendTo } from "@/lib/notify/bot";
import { answerButton, answerReason } from "@/lib/repairs/approval-telegram";
import { readLinkToken, webhookSecret } from "@/lib/notify/link";
import { notifyDb, removeLinkOfChat, saveLink } from "@/lib/notify/store";
import { categoriesForRole } from "@/lib/notify/categories";
import { roleFromDb } from "@/lib/roles";

interface Update {
  message?: { text?: string; chat?: { id: number; type?: string }; from?: { username?: string }; reply_to_message?: { message_id?: number } };
  callback_query?: { id: string; data?: string; message?: { chat?: { id: number; type?: string } } };
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Telegram calls this when someone writes to the bot. Only a private chat can connect; everything else is ignored.
export async function POST(request: Request) {
  const token = botToken();
  if (!token) return Response.json({ ok: false }, { status: 503 });
  if (!same(request.headers.get("x-telegram-bot-api-secret-token") ?? "", webhookSecret(token))) return Response.json({ ok: false }, { status: 401 });

  const update = (await request.json().catch(() => null)) as Update | null;
  // a button on a repair approval message
  const cb = update?.callback_query;
  if (cb) {
    const chatId = cb.message?.chat?.id;
    const shown = chatId && cb.message?.chat?.type === "private" ? await answerButton(cb.data, chatId).catch(() => "Something went wrong. Open MAD → Repairs.") : "Not available here.";
    await answerCallback(cb.id, shown).catch(() => undefined);
    revalidatePath("/repairs"); revalidatePath("/cars");
    return Response.json({ ok: true });
  }
  const chat = update?.message?.chat, text = (update?.message?.text ?? "").trim();
  // the reason typed after pressing Reject
  if (chat?.type === "private" && text && !text.startsWith("/") && update?.message?.reply_to_message?.message_id) {
    const said = await answerReason(chat.id, update.message.reply_to_message.message_id, text).catch(() => "Something went wrong. Open MAD → Repairs.");
    if (said) { await sendTo(chat.id, said).catch(() => undefined); revalidatePath("/repairs"); revalidatePath("/cars"); return Response.json({ ok: true }); }
  }
  if (!chat || chat.type !== "private" || !text.startsWith("/")) return Response.json({ ok: true });
  const [command, arg] = text.split(/\s+/, 2);
  const cmd = command.toLowerCase().replace(/@.*$/, "");
  const reply = (t: string) => sendTo(chat.id, t).catch(() => undefined);

  if (cmd === "/start" && arg) {
    const userId = readLinkToken(token, arg);
    if (!userId) { await reply("This link has expired. Open MAD → My Telegram and press Connect again."); return Response.json({ ok: true }); }
    const { data: p } = await notifyDb().from("profiles").select("full_name, role").eq("id", userId).maybeSingle();
    if (!p) { await reply("I could not find your MAD account. Ask the Admin."); return Response.json({ ok: true }); }
    await saveLink(userId, chat.id, update?.message?.from?.username ?? null);
    const mine = categoriesForRole(roleFromDb(p.role));
    await reply(`✅ Connected${p.full_name ? `, ${p.full_name}` : ""}.\nYou will get your MAD messages here:\n${mine.map((c) => `• ${c.label}`).join("\n")}\n\nChoose what you get in MAD → My Telegram. Send /stop to disconnect.`);
  } else if (cmd === "/stop") {
    const had = await removeLinkOfChat(chat.id);
    await reply(had ? "Disconnected. You will not get MAD messages here any more." : "This chat was not connected.");
  } else if (cmd === "/status") {
    const { data } = await notifyDb().from("telegram_links").select("user_id").eq("chat_id", chat.id).maybeSingle();
    await reply(data ? "✅ This chat is connected to your MAD account." : "This chat is not connected. Open MAD → My Telegram and press Connect.");
  } else {
    await reply("To connect, open MAD → My Telegram and press Connect Telegram. Commands: /status, /stop.");
  }
  return Response.json({ ok: true });
}
