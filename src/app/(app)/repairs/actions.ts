"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { announceWebDecision } from "@/lib/repairs/bot/runtime";
import { decideRepairs, updateRepair } from "@/lib/repairs/server";

export type RepairResult = { ok: true; message: string } | { ok: false; error: string };
const ids = z.array(z.string().uuid()).min(1).max(20);

// Anyone signed in can SEE the repairs; only an Approver (and the Admin) decides and updates.
export async function approveRepairsAction(raw: string[]): Promise<RepairResult> {
  const user = await requireRole("approver", "admin");
  const p = ids.safeParse(raw);
  if (!p.success) return { ok: false, error: "Nothing was chosen." };
  const r = await decideRepairs(p.data, true, "", { name: user.fullName ?? "Approver", userId: user.id });
  if (!r.ok) return r;
  await announceWebDecision(p.data, true, "", user.fullName ?? "Approver");
  revalidatePath("/repairs"); revalidatePath("/cars");
  return { ok: true, message: `Approved ${r.changed} ${r.changed === 1 ? "job" : "jobs"}.` };
}

export async function rejectRepairsAction(raw: string[], reason: string): Promise<RepairResult> {
  const user = await requireRole("approver", "admin");
  const p = ids.safeParse(raw);
  if (!p.success) return { ok: false, error: "Nothing was chosen." };
  const r = await decideRepairs(p.data, false, reason.slice(0, 280), { name: user.fullName ?? "Approver", userId: user.id });
  if (!r.ok) return r;
  await announceWebDecision(p.data, false, reason, user.fullName ?? "Approver");
  revalidatePath("/repairs");
  return { ok: true, message: `Rejected ${r.changed} ${r.changed === 1 ? "job" : "jobs"}.` };
}

const update = z.object({ status: z.string().max(20).optional(), estTimeline: z.string().max(40).optional(), supplier: z.string().max(100).optional(), company: z.string().max(100).optional(), note: z.string().max(200).optional() });
export async function updateRepairAction(id: string, raw: z.input<typeof update>): Promise<RepairResult> {
  const user = await requireRole("approver", "admin");
  const p = update.safeParse(raw);
  if (!z.string().uuid().safeParse(id).success || !p.success) return { ok: false, error: "Some values are not valid." };
  const r = await updateRepair(id, p.data, { name: user.fullName ?? "Approver", userId: user.id });
  if (!r.ok) return r;
  revalidatePath("/repairs"); revalidatePath("/cars");
  return { ok: true, message: "Saved." };
}
