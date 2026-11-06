"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createCategory, renameCategory } from "@/lib/pcf/actions/categories";
import type { CategoryRow } from "@/components/pcf/admin/types";
import { ResponsiveDialog } from "@/components/pcf/shared/responsive-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createCategorySchema,
  type CategoryFormValues,
} from "@/lib/pcf/validators/category";

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: CategoryRow | null;
  onSaved: () => void;
}) {
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(createCategorySchema),
    defaultValues: { name: category?.name ?? "" },
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(values: CategoryFormValues) {
    setSubmitting(true);
    setServerError(null);
    const result = category
      ? await renameCategory({ id: category.id, name: values.name })
      : await createCategory({ name: values.name });
    setSubmitting(false);

    if (!result.ok) {
      setServerError(result.error);
      if (result.fieldErrors?.name) {
        form.setError("name", { message: result.fieldErrors.name[0] });
      }
      return;
    }

    onOpenChange(false);
    onSaved();
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={category ? "Rename category" : "New category"}
      description={
        category
          ? "Renaming keeps existing vouchers linked to this category."
          : "Categories that are deactivated stay on old vouchers."
      }
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="category-name">Name</Label>
          <Input
            id="category-name"
 maxLength={60}
            placeholder="Transportation"
            {...form.register("name")}
            aria-invalid={Boolean(form.formState.errors.name)}
          />
          {form.formState.errors.name ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.name.message}
            </p>
          ) : null}
        </div>

        {serverError ? (
          <Alert variant="destructive">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving..." : category ? "Rename" : "Add category"}
          </Button>
        </DialogFooter>
      </form>
    </ResponsiveDialog>
  );
}
