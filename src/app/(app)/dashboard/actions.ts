"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireModule } from "@/lib/auth";
import { DASHBOARD_TAG } from "@/lib/dashboard/sheets";

// A guard so that pressing Refresh over and over cannot hammer Google (this server process only).
const COOLDOWN_MS = 5_000;
let lastRefresh = 0;

/** "Refresh now": forget what was read from the sheets a moment ago, so the next look is straight from Google. */
export async function refreshDashboardAction(): Promise<{ at: string }> {
  await requireModule("dashboard");
  const now = Date.now();
  if (now - lastRefresh >= COOLDOWN_MS) {
    lastRefresh = now;
    updateTag(DASHBOARD_TAG);
    revalidatePath("/dashboard", "layout");
  }
  return { at: new Date().toISOString() };
}
