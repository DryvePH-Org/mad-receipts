"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword, type ActionResult } from "./actions";

export function ResetPasswordDialog({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ActionResult, form: FormData) => {
    const result = await resetPassword(prev, form);
    if (result?.ok) {
      toast.success(result.message);
      setOpen(false);
    }
    return result;
  }, null);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Reset password
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title="Reset password" description={`Set a new password for ${name}.`}>
        <form action={action} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          <div className="space-y-2">
            <Label htmlFor={`pw-${userId}`}>New password</Label>
            <Input id={`pw-${userId}`} name="password" type="text" minLength={8} autoComplete="new-password" required />
            <p className="text-xs text-muted-foreground">At least 8 characters. Tell them to keep it private.</p>
          </div>
          {state && !state.ok && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
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
