"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/shared/form-field";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetPasswordSchema } from "@/lib/forms";
import { useActionForm } from "@/lib/use-action-form";
import { resetPassword } from "./actions";

export function ResetPasswordDialog({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const { form, onSubmit, serverError, pending } = useActionForm({
    schema: resetPasswordSchema,
    defaultValues: { password: "" },
    extra: { userId },
    run: (body) => resetPassword(null, body),
    onSuccess: (message) => {
      toast.success(message);
      form.reset();
      setOpen(false);
    },
  });
  const { register, formState: { errors } } = form;
  const id = `pw-${userId}`;

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Reset password
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title="Reset password" description={`Set a new password for ${name}.`}>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <FormField id={id} label="New password" error={errors.password?.message} hint="At least 8 characters. Tell them to keep it private.">
            <Input id={id} type="text" autoComplete="new-password" aria-invalid={!!errors.password} {...register("password")} />
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
              {pending ? "Saving…" : "Save password"}
            </Button>
          </div>
        </form>
      </ResponsiveDialog>
    </>
  );
}
