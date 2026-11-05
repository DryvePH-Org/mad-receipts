"use server";

import { requireRole } from "@/lib/auth";
import { docsErrorText } from "@/lib/docs/service";
import { lookupForSales, type LookupResult } from "@/lib/docs/sales";

export async function lookupCarAction(plate: string): Promise<LookupResult> {
  await requireRole("sales", "admin", "approver");
  try { return await lookupForSales(String(plate).slice(0, 20)); } catch (err) { return { ok: false, message: docsErrorText(err) }; }
}
