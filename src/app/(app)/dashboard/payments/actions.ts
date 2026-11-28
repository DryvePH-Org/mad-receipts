"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { syncPaymentSheets } from "@/lib/payments/sync";

export interface RefreshStep { ok: boolean; since: number; copied: number; rows: number; remaining: number; failed: { tab: string; error: string }[]; message?: string }

/**
 * The Super Admin copies the payments sheet into MAD now, a few tabs at a time (the page calls this again until nothing remains, so no request is long).
 * `since` (null on the first call, then the one returned) is when the refresh began: every tab not copied since then is still to do; `skip` are the tabs that already failed in this refresh.
 */
export async function refreshPaymentsAction(sinceIn: number | null, skip: string[]): Promise<RefreshStep> {
  await requireRole("super_admin");
  const since = sinceIn ?? Date.now(); // the server's clock starts the refresh, so a different clock on the phone or laptop cannot confuse it
  try {
    const r = await syncPaymentSheets({ since, skip, maxTabs: 3 });
    if (r.skipped) return { ok: false, since, copied: 0, rows: 0, remaining: 0, failed: [], message: `Not copied: ${r.skipped}.` };
    if (r.remaining === 0 || r.copied.length) revalidatePath("/dashboard/payments");
    return { ok: true, since, copied: r.copied.length, rows: r.copied.reduce((n, c) => n + c.rows, 0), remaining: r.remaining, failed: r.failed };
  } catch (e) { return { ok: false, since, copied: 0, rows: 0, remaining: 0, failed: [], message: e instanceof Error ? e.message : "Could not copy the sheet." }; }
}
