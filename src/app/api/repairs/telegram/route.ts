import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import type { TgUpdate } from "@/lib/repairs/bot/flow";
import { realFlow } from "@/lib/repairs/bot/runtime";
import { repairsToken, repairsWebhookSecret } from "@/lib/repairs/bot/telegram";

// Telegram calls this for every message and button press in the repairs group. It answers at once and does the work after, so Telegram never waits
// (a late answer makes Telegram send the same update again; the update id makes sure it is handled once).
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(request: Request) {
  const token = repairsToken();
  if (!token) return Response.json({ ok: false }, { status: 503 });
  if (!same(request.headers.get("x-telegram-bot-api-secret-token") ?? "", repairsWebhookSecret(token))) return Response.json({ ok: false }, { status: 401 });
  const update = (await request.json().catch(() => null)) as TgUpdate | null;
  if (!update || typeof update.update_id !== "number") return Response.json({ ok: true });
  after(async () => {
    try { await realFlow().handle(update); } catch (e) { console.error(`[repairs-bot] update ${update.update_id} failed: ${e instanceof Error ? e.message : "unknown"}`); }
  });
  return Response.json({ ok: true });
}
