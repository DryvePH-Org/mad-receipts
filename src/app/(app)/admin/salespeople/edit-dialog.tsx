"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSalesperson, type ActionResult } from "./actions";

export function EditSalespersonDialog({ id, name, aliases }: { id: string; name: string; aliases: string[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ActionResult, form: FormData) => {
    const result = await updateSalesperson(prev, form);
    if (result?.ok) {
      toast.success(result.message);
      setOpen(false);
    }
    return result;
  }, null);

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
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={id} />
          <div className="space-y-2">
            <Label htmlFor={`name-${id}`}>Name</Label>
            <Input id={`name-${id}`} name="name" defaultValue={name} required maxLength={60} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`aliases-${id}`}>Nicknames and other spellings</Label>
            <Input id={`aliases-${id}`} name="aliases" defaultValue={aliases.join(", ")} />
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
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </ResponsiveDialog>
    </>
  );
}
