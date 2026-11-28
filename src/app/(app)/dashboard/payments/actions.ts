"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { syncPaymentSheets } from "@/lib/payments/sync";

/** The Super Admin copies every tab of the payments sheet into MAD right now. */
export async function refreshPaymentsAction(): Promise<{ ok: boolean; message: string }> {
  await requireRole("super_admin");
  try {
    const r = await syncPaymentSheets({ force: true, maxTabs: 60 });
    revalidatePath("/dashboard/payments");
    if (r.skipped) return { ok: false, message: `Not copied: ${r.skipped}.` };
    if (r.failed.length) return { ok: false, message: `${r.copied.length} tabs copied, ${r.failed.length} failed: ${r.failed[0].error}` };
    return { ok: true, message: r.copied.length ? `Copied ${r.copied.length} ${r.copied.length === 1 ? "tab" : "tabs"} from the sheet (${r.copied.reduce((n, c) => n + c.rows, 0)} rows).` : "Everything is already up to date." };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Could not copy the sheet." }; }
}
