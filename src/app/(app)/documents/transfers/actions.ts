"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { normalizePlate } from "@/lib/rules/plate";
import { addTransfer, markChecked, saveTransfer } from "@/lib/transfers/server";

export type TransferResult = { ok: true } | { ok: false; error: string };

const text = (n: number) => z.string().max(n);
const date = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Dates are day, month and year.");
const input = z.object({
  particular: text(60), financing: text(60), buyer: text(120), address: text(200), contact: text(120), crDate: date, transactionDate: date,
  liaison: text(60), sales: text(60), balance: text(60), note: text(400), doneOn: date,
  soldOn: date, agreedPrice: text(20), route: z.enum(["mad", "client", "unknown"]), stage: z.enum(["in_process", "transferred", "released", "delivered", "unknown", "cancelled"]), originalsAt: text(80), nextStep: text(160),
});

export async function saveTransferAction(id: string, raw: z.input<typeof input>): Promise<TransferResult> {
  const user = await requireRole("super_admin", "admin", "buying", "sales");
  const p = input.safeParse(raw);
  if (!z.string().uuid().safeParse(id).success || !p.success) return { ok: false, error: p.success ? "That transfer was not found." : p.error.issues[0]?.message ?? "Some values are not valid." };
  const error = await saveTransfer(id, p.data, user.id);
  if (error) return { ok: false, error: `Could not save: ${error}` };
  revalidatePath("/documents/transfers");
  return { ok: true };
}

export async function markCheckedAction(id: string): Promise<TransferResult> {
  const user = await requireRole("super_admin", "admin", "buying", "sales");
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "That transfer was not found." };
  const error = await markChecked(id, user.id);
  if (error) return { ok: false, error: `Could not save: ${error}` };
  revalidatePath("/documents/transfers");
  return { ok: true };
}

export async function addTransferAction(plateRaw: string, raw: z.input<typeof input>): Promise<TransferResult> {
  const user = await requireRole("super_admin", "admin", "buying", "sales");
  const plate = normalizePlate(plateRaw);
  const p = input.safeParse(raw);
  if (!plate) return { ok: false, error: "Type the plate number." };
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Some values are not valid." };
  const error = await addTransfer(plate, p.data, user.id);
  if (error) return { ok: false, error: `Could not add: ${error}` };
  revalidatePath("/documents/transfers");
  revalidatePath(`/documents/${plate}`);
  return { ok: true };
}
