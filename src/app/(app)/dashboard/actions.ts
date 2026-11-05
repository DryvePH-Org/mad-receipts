"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireRole } from "@/lib/auth";
import { DASHBOARD_TAG } from "@/lib/dashboard/sheets";

/** "Refresh now": forget what was read from the sheets a moment ago, so the next look is straight from Google. */
export async function refreshDashboardAction(): Promise<{ at: string }> {
  await requireRole("admin", "approver");
  updateTag(DASHBOARD_TAG);
  revalidatePath("/dashboard", "layout");
  return { at: new Date().toISOString() };
}
