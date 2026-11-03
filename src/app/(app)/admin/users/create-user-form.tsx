"use client";

import { toast } from "sonner";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createUserSchema } from "@/lib/forms";
import { useActionForm } from "@/lib/use-action-form";
import { createStaffUser } from "./actions";

export function CreateUserForm() {
  const { form, onSubmit, serverError, pending } = useActionForm({
    schema: createUserSchema,
    defaultValues: { fullName: "", email: "", password: "" },
    run: (body) => createStaffUser(null, body),
    onSuccess: (message) => {
      toast.success(message);
      form.reset();
    },
  });
  const { register, formState: { errors } } = form;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormField id="fullName" label="Full name" error={errors.fullName?.message}>
        <Input id="fullName" aria-invalid={!!errors.fullName} {...register("fullName")} />
      </FormField>
      <FormField id="email" label="Email" error={errors.email?.message}>
        <Input id="email" type="email" inputMode="email" aria-invalid={!!errors.email} {...register("email")} />
      </FormField>
      <FormField id="password" label="Temporary password" error={errors.password?.message} hint="At least 8 characters.">
        <Input id="password" type="text" autoComplete="new-password" aria-invalid={!!errors.password} {...register("password")} />
      </FormField>
      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create staff user"}
      </Button>
    </form>
  );
}
