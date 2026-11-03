"use client";

import { toast } from "sonner";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salespersonSchema } from "@/lib/forms";
import { useActionForm } from "@/lib/use-action-form";
import { addSalesperson } from "./actions";

export function AddSalespersonForm() {
  const { form, onSubmit, serverError, pending } = useActionForm({
    schema: salespersonSchema,
    defaultValues: { name: "", aliases: "" },
    run: (body) => addSalesperson(null, body),
    onSuccess: (message) => {
      toast.success(message);
      form.reset();
    },
  });
  const { register, formState: { errors } } = form;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormField id="name" label="Name" error={errors.name?.message}>
        <Input id="name" maxLength={60} placeholder="David Santos" aria-invalid={!!errors.name} {...register("name")} />
      </FormField>
      <FormField
        id="aliases"
        label="Nicknames and other spellings (optional)"
        hint="Separate with commas. These help the voice recording understand how the name is said."
      >
        <Input id="aliases" placeholder="Dave, Dabid" {...register("aliases")} />
      </FormField>
      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Adding…" : "Add salesperson"}
      </Button>
    </form>
  );
}
