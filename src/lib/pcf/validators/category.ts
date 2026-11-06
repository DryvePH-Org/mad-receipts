import { z } from "zod";

import { labelText } from "@/lib/pcf/validators/text";

export const categoryNameSchema = labelText(60, "Category name is required");

export const createCategorySchema = z.object({
  name: categoryNameSchema,
});

export const renameCategorySchema = z.object({
  id: z.string().uuid(),
  name: categoryNameSchema,
});

export const setCategoryActiveSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export type CategoryFormValues = z.infer<typeof createCategorySchema>;
