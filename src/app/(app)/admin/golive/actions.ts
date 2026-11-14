"use server";

import { requireAdmin, requireModule } from "@/lib/auth";
import { runGoLiveChecks, type Check } from "@/lib/golive/checks";

/** Runs every go-live check (read only). Admin only. */
export async function runChecksAction(): Promise<{ ok: true; checks: Check[]; at: string } | { ok: false; message: string }> {
  await requireAdmin();
  await requireModule("sync");
  try { return { ok: true, checks: await runGoLiveChecks(), at: new Date().toISOString() }; }
  catch (e) { return { ok: false, message: e instanceof Error ? e.message : "The checks could not run." }; }
}
