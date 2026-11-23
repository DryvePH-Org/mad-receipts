"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireModule } from "@/lib/auth";
import { editsPapers } from "@/lib/roles";
import { resolveReview } from "@/lib/docsbible/review-server";

const action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("keep") }),
  z.object({ type: z.literal("archive"), unitId: z.uuid() }),
  z.object({ type: z.literal("add_plate"), plate: z.string().max(20) }),
  z.object({ type: z.literal("use_status"), which: z.enum(["sale", "vehicle"]) }),
  z.object({ type: z.literal("classify"), value: z.string().max(40) }),
  z.object({ type: z.literal("set_date"), date: z.string().max(20) }),
  z.object({ type: z.literal("set_plate"), plate: z.string().max(20) }),
  z.object({ type: z.literal("add_sale_plate"), plate: z.string().max(20) }),
]);

/** Settling one item of the review list. Everyone who edits the car papers; Online Marketing can look. */
export async function resolveReviewAction(itemId: string, a: unknown): Promise<{ ok: boolean; message: string }> {
  const user = await requireModule("register");
  if (!editsPapers(user.role)) return { ok: false, message: "You can look at these; the people who edit the car papers settle them." };
  const id = z.uuid().safeParse(itemId), parsed = action.safeParse(a);
  if (!id.success || !parsed.success) return { ok: false, message: "Bad request." };
  const r = await resolveReview(id.data, parsed.data, user.id);
  if (r.ok) revalidatePath("/docs-bible", "layout");
  return r;
}
