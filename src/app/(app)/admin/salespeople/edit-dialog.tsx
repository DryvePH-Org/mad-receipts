"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/shared/form-field";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salespersonSchema } from "@/lib/forms";
import { useActionForm } from "@/lib/use-action-form";
import { updateSalesperson } from "./actions";

export function EditSalespersonDialog({ id, name, aliases }: { id: string; name: string; aliases: string[] }) {
  const [open, setOpen] = useState(false);
  const { form, onSubmit, serverError, pending } = useActionForm({
    schema: salespersonSchema,
    defaultValues: { name, aliases: aliases.join(", ") },
    extra: { id },
    run: (body) => updateSalesperson(null, body),
    onSuccess: (message) => {
      toast.success(message);
      setOpen(false);
    },
  });
  const { register, formState: { errors } } = form;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={`Edit ${name}`}
        description="Past sales keep their salespeople. Renaming updates the name everywhere."
      >
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormField id={`name-${id}`} label="Name" error={errors.name?.message}>
            <Input id={`name-${id}`} maxLength={60} aria-invalid={!!errors.name} {...register("name")} />
          </FormField>
          <FormField id={`aliases-${id}`} label="Nicknames and other spellings">
            <Input id={`aliases-${id}`} {...register("aliases")} />
          </FormField>
          {serverError && (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </ResponsiveDialog>
    </>
  );
}
