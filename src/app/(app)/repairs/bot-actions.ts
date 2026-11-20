"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { deleteRepairsWebhook, repairsToken, repairsWebhookInfo, setRepairsCommands, setRepairsWebhook } from "@/lib/repairs/bot/telegram";
import { tr } from "@/lib/repairs/bot/texts";

export type BotResult = { ok: true; message: string } | { ok: false; error: string };
const ADDRESS = () => `${(process.env.APP_BASE_URL || "https://mad.dryveph.io").replace(/\/$/, "")}/api/repairs/telegram`;

/** The switch: Telegram now sends the repairs group's messages to the app. "Turn off" undoes this. */
export async function switchBotAction(confirm: string): Promise<BotResult> {
  await requireRole("admin");
  if (!repairsToken()) return { ok: false, error: "The bot token is not set on the server yet." };
  if (confirm.trim().toUpperCase() !== "SWITCH") return { ok: false, error: "Type SWITCH to confirm." };
  try {
    await setRepairsWebhook(ADDRESS());
    await setRepairsCommands(["report", "open", "language", "menu", "help", "whoami"].map((c) => ({ command: c, description: tr("en", `cmd.${c}`) })));
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Telegram refused." }; }
  revalidatePath("/repairs");
  return { ok: true, message: "Done. The bot now answers from the app." };
}

/** Turns the bot off: no webhook, so nobody receives the group's messages until it is switched on again (the old Python bot is gone). */
export async function goBackAction(): Promise<BotResult> {
  await requireRole("admin");
  if (!repairsToken()) return { ok: false, error: "The bot token is not set on the server yet." };
  try { await deleteRepairsWebhook(); } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Telegram refused." }; }
  revalidatePath("/repairs");
  return { ok: true, message: "Done. The bot is off: the app no longer receives the group's messages." };
}

export async function botStateAction(): Promise<{ url: string; pending: number; error: string | null } | null> {
  await requireRole("admin");
  if (!repairsToken()) return null;
  try { const w = await repairsWebhookInfo(); return { url: w.url, pending: w.pending_update_count ?? 0, error: w.last_error_message ?? null }; } catch { return null; }
}
