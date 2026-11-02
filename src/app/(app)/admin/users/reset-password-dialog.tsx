"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword, type ActionResult } from "./actions";

export function ResetPasswordDialog({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    async (prev: ActionResult, form: FormData) => {
      const result = await resetPassword(prev, form);
      if (result?.ok) {
        toast.success(result.message);
        setOpen(false);
      }
      return result;
    },
    null,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="h-10" />}>
        Reset password
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>Set a new password for {name}.</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <input type="hidden" name="userId" value={userId} />
          <div className="space-y-2">
            <Label htmlFor={`pw-${userId}`}>New password</Label>
            <Input
              id={`pw-${userId}`}
              name="password"
              type="text"
              minLength={8}
              autoComplete="new-password"
              required
              className="h-12 text-base"
            />
          </div>
          {state && !state.ok && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}
          <Button type="submit" disabled={pending} className="h-12 w-full text-base">
            {pending ? "Saving…" : "Save password"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
