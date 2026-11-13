"use server";

import { requireAdmin, requireModule } from "@/lib/auth";
import { GrokbotError, grokbotMissing, sendJob } from "@/lib/grokbot/client";
import { defaultGrokbotDeps } from "@/lib/grokbot/store";

export type GrokbotTest = { ok: true; message: string } | { ok: false; message: string };

/** Sends a "ping" job and waits for the bot's answer: proves the address, the key and the callback all work. Admin only. */
export async function testGrokbotAction(): Promise<GrokbotTest> {
  const user = await requireAdmin();
  await requireModule("sync");
  const missing = grokbotMissing();
  if (missing.length) return { ok: false, message: `Not set up on this server yet: ${missing.join(", ")}.` };
  const started = Date.now();
  try {
    const { result } = await sendJob("ping", {}, defaultGrokbotDeps(), { timeoutMs: 100_000, createdBy: user.id });
    const secs = Math.round((Date.now() - started) / 100) / 10;
    return result.pong === true ? { ok: true, message: `The grokbot answered in ${secs} seconds.` } : { ok: false, message: "The grokbot answered, but not with a pong. Check its routine." };
  } catch (err) {
    return { ok: false, message: err instanceof GrokbotError || err instanceof Error ? err.message : "The test failed." };
  }
}
