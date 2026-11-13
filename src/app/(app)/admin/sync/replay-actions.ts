"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireAdmin, requireModule } from "@/lib/auth";
import { inventory } from "@/lib/inventory";
import { createSheetsClient } from "@/lib/google/sheets";
import { FROZEN_MESSAGE, sheetsFrozen } from "@/lib/google/freeze";
import { logSheetProblem } from "@/lib/sync/targets";
import { planReplay, runReplay, type ReplayCar } from "@/lib/sync/replay";
import { processDueJobs } from "@/lib/sync/process";
import { createAdminClient } from "@/lib/supabase/admin";

const tail = (id?: string) => (id ? `…${id.slice(-6)}` : "not set");

export interface ReplayPlan {
  /** the last characters of each connected id, so the Admin can tell the live sheet from the test copy */
  connected: { inventory: string; logSheet: string; driveFolder: string };
  approvedReceipts: number;
  cars: ReplayCar[];
  /** something wrong with the log sheet (wrong file or tab), or null */
  logSheetProblem: string | null;
}

async function guard() {
  const user = await requireAdmin();
  await requireModule("sync");
  return user;
}

/** Looks at the live sheet and shows, for every car, what would change. Writes nothing. */
export async function getReplayPlan(): Promise<{ ok: true; plan: ReplayPlan } | { ok: false; error: string }> {
  await guard();
  try {
    const { cars, approvedReceipts } = await planReplay(createAdminClient(), inventory);
    const logId = process.env.GOOGLE_SHEET_ID;
    // a log sheet that cannot be checked is reported, it does not stop the preview
    let logProblem: string | null;
    try { logProblem = logId ? await logSheetProblem(createSheetsClient(), logId) : "The log sheet id is not set."; } catch { logProblem = "The log sheet could not be read. Check that its id is right and that the Apps Script may open it."; }
    return { ok: true, plan: { logSheetProblem: logProblem, connected: { inventory: tail(process.env.INVENTORY_SHEET_ID), logSheet: tail(process.env.GOOGLE_SHEET_ID), driveFolder: tail(process.env.GOOGLE_DRIVE_FOLDER_ID) }, approvedReceipts, cars } };
  } catch (e) {
    console.error(`[replay] plan failed: ${e instanceof Error ? e.message : "unknown"}`);
    return { ok: false, error: "Could not read the inventory sheet. Check the connection, then try again." };
  }
}

const requestSchema = z.object({ plates: z.array(z.string().max(20)).max(2000), logRows: z.boolean(), drive: z.boolean() });

/** Sends the chosen things to the live sheets. The words REPLAY must be typed, here as well as in the box. */
export async function runReplayAction(request: unknown, typed: string): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const user = await guard();
  if (sheetsFrozen()) return { ok: false, error: FROZEN_MESSAGE };
  if (String(typed ?? "").trim() !== "REPLAY") return { ok: false, error: "Type REPLAY to confirm." };
  const parsed = requestSchema.safeParse(request);
  if (!parsed.success) return { ok: false, error: "That request is not valid." };
  const admin = createAdminClient();
  try {
    const r = await runReplay(admin, inventory, parsed.data);
    await admin.from("audit_logs").insert({ actor_id: user.id, action: "sync.replay", entity: "sync", entity_id: null, after: { cars: r.written, queued: r.queued, logRows: parsed.data.logRows, drive: parsed.data.drive } });
    // The log rows and Drive files take a while (one call to Google each), so they run in the background.
    if (r.queued) after(async () => { for (let i = 0; i < 40; i++) { const s = await processDueJobs({ limit: 25 }).catch(() => null); if (!s || s.claimed === 0) break; } });
    revalidatePath("/admin/sync");
    const parts = [`${r.written} inventory ${r.written === 1 ? "note" : "notes"} written`, r.queued ? `${r.queued} log and Drive jobs started (watch them on this page)` : null, r.skipped.length ? `${r.skipped.length} skipped` : null].filter(Boolean);
    return { ok: true, message: `${parts.join(", ")}.` };
  } catch (e) {
    console.error(`[replay] failed: ${e instanceof Error ? e.message : "unknown"}`);
    return { ok: false, error: "It stopped part-way. Nothing already written is undone; open the preview again to see what is left." };
  }
}
