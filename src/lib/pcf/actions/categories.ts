"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { safeDbMessage } from "@/lib/pcf/db-error";
import { actionError, type ActionResult } from "@/lib/pcf/action-result";
import { getAdminUser } from "@/lib/pcf/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createCategorySchema,
  renameCategorySchema,
  setCategoryActiveSchema,
} from "@/lib/pcf/validators/category";

function validationError(error: z.ZodError): ActionResult {
  return actionError(
    "Check the highlighted fields.",
    z.flattenError(error).fieldErrors as Record<string, string[]>,
  );
}

function categoryWriteError(code: string | undefined, message: string) {
  if (code === "23505") {
    return actionError("A category with this name already exists.");
  }
  return actionError(message);
}

export async function createCategory(input: {
  name: string;
}): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) {
    return actionError("Only administrators can manage categories.");
  }

  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .insert({ name: parsed.data.name });

  if (error) return categoryWriteError(error.code, safeDbMessage(error));

  revalidatePath("/pcf/categories");
  return { ok: true };
}

export async function renameCategory(input: {
  id: string;
  name: string;
}): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) {
    return actionError("Only administrators can manage categories.");
  }

  const parsed = renameCategorySchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.id);

  if (error) return categoryWriteError(error.code, safeDbMessage(error));

  revalidatePath("/pcf/categories");
  return { ok: true };
}

export async function setCategoryActive(input: {
  id: string;
  isActive: boolean;
}): Promise<ActionResult> {
  const admin = await getAdminUser();
  if (!admin) {
    return actionError("Only administrators can manage categories.");
  }

  const parsed = setCategoryActiveSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ is_active: parsed.data.isActive })
    .eq("id", parsed.data.id);

  if (error) return actionError(safeDbMessage(error));

  revalidatePath("/pcf/categories");
  return { ok: true };
}
