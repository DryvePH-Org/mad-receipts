"use server";

import { revalidatePath } from "next/cache";
import { requireSuper, requireModule } from "@/lib/auth";
import { isDocStage, startBotScan } from "@/lib/docs/bot-scan";
import { GrokbotError, grokbotMissing, sendJob } from "@/lib/grokbot/client";
import { defaultGrokbotDeps } from "@/lib/grokbot/store";
import { normalizePlate } from "@/lib/rules/plate";
import { createAdminClient } from "@/lib/supabase/admin";

export type GrokbotTest = { ok: true; message: string } | { ok: false; message: string };

/** Sends a "ping" to the scanner and waits for its answer: proves the address, the key and the callback all work. Admin only. */
export async function testGrokbotAction(): Promise<GrokbotTest> {
  const user = await requireSuper();
  await requireModule("sync");
  const missing = grokbotMissing();
  if (missing.length) return { ok: false, message: `Not set up on this server yet: ${missing.join(", ")}.` };
  const started = Date.now();
  try {
    const { result } = await sendJob("ping", {}, defaultGrokbotDeps(), { timeoutMs: 100_000, createdBy: user.id });
    const secs = Math.round((Date.now() - started) / 100) / 10;
    return result.pong === true ? { ok: true, message: `The scanner answered in ${secs} seconds.` } : { ok: false, message: "The bot answered, but not with a pong. Check its routine." };
  } catch (err) {
    return { ok: false, message: err instanceof GrokbotError || err instanceof Error ? err.message : "The test failed." };
  }
}

/** Takes a job that has not been sent yet out of the queue. A job already with the bot cannot be cancelled. */
export async function cancelQueuedJobAction(formData: FormData): Promise<void> {
  await requireSuper();
  await requireModule("sync");
  const id = String(formData.get("id") ?? "");
  if (!/^[a-z_]{3,40}-[0-9a-f]{10}$/.test(id)) return;
  const store = defaultGrokbotDeps().store;
  const row = await store.get(id);
  if (row?.status === "queued") await store.complete(id, null, false, "Cancelled by an admin.");
  // a cancelled scan leaves its photos waiting, so they can be scanned again
  revalidatePath("/admin/sync");
}

/** Makes a car's failed photos waiting again and puts a new scan in the queue. */
export async function retryScanAction(formData: FormData): Promise<void> {
  await requireSuper();
  await requireModule("sync");
  const plate = normalizePlate(String(formData.get("plate") ?? ""));
  if (plate.length < 5) return;
  const stage = isDocStage(formData.get("stage")) ? (formData.get("stage") as "in" | "out" | "transfer") : "in";
  await createAdminClient().from("folder_files").update({ read_status: "pending", read_error: null }).eq("plate_no", plate).eq("stage", stage).eq("read_status", "failed");
  await startBotScan(plate, undefined, undefined, stage).catch(() => undefined);
  revalidatePath("/admin/sync");
}
