"use server";

import { requireUser } from "@/lib/auth";
import { remindersFor } from "@/lib/data";
import { createTelegramClient } from "@/lib/telegram";

export type SendResult = { ok: true; sent: number } | { ok: false; error: string };

/** Sends one reminder (or all of the person's reminders) to the Telegram group. */
export async function sendReminders(key?: string): Promise<SendResult> {
  const user = await requireUser();
  const list = (await remindersFor(user)).filter((n) => !key || n.key === key);
  if (list.length === 0) return { ok: false, error: "That reminder is no longer needed." };
  try {
    await createTelegramClient().sendMessage(`⏰ Reminders\n\n${list.map((n) => `• ${n.title}\n  ${n.detail}`).join("\n\n")}`);
  } catch {
    return { ok: false, error: "Could not send to Telegram. Check that it is set up." };
  }
  return { ok: true, sent: list.length };
}
