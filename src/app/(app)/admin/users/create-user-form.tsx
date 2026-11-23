"use client";

import { toast } from "sonner";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/shared/password-input";
import { NativeSelect } from "@/components/ui/native-select";
import { createUserSchema } from "@/lib/forms";
import { useActionForm } from "@/lib/use-action-form";
import { createUser } from "./actions";

export function CreateUserForm({ onDone, canMakeAdmin = true }: { onDone?: () => void; canMakeAdmin?: boolean } = {}) {
  const { form, onSubmit, serverError, pending } = useActionForm({
    schema: createUserSchema,
    defaultValues: { fullName: "", email: "", password: "", confirm: "", role: "sales" as const },
    run: (body) => createUser(null, body),
    onSuccess: (message) => {
      toast.success(message);
      form.reset();
      onDone?.();
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
      <FormField id="role" label="Role" hint="Sales and Buying work on the cars, Online Marketing only looks, the Admin oversees every module, the Super Admin also runs Settings, Users and Sync jobs.">
        <NativeSelect id="role" {...register("role")}>
          <option value="sales">Sales</option>
          <option value="buying">Buying</option>
          <option value="marketing">Online Marketing</option>
          {canMakeAdmin && <option value="admin">Admin</option>}
          {canMakeAdmin && <option value="super_admin">Super Admin</option>}
        </NativeSelect>
      </FormField>
      <FormField id="password" label="Temporary password" error={errors.password?.message} hint="At least 8 characters. Use the eye to check what you typed.">
        <PasswordInput id="password" autoComplete="new-password" aria-invalid={!!errors.password} {...register("password")} />
      </FormField>
      <FormField id="confirm" label="Confirm password" error={errors.confirm?.message}>
        <PasswordInput id="confirm" autoComplete="new-password" aria-invalid={!!errors.confirm} {...register("confirm")} />
      </FormField>
      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create user"}
      </Button>
    </form>
  );
}
