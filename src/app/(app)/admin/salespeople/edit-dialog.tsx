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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="h-10" />}>Edit</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {name}</DialogTitle>
          <DialogDescription>Past sales keep their salespeople. Renaming updates the name everywhere.</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-3">
          <input type="hidden" name="id" value={id} />
          <div className="space-y-2">
            <Label htmlFor={`name-${id}`}>Name</Label>
            <Input id={`name-${id}`} name="name" defaultValue={name} required maxLength={60} className="h-12 text-base" />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`aliases-${id}`}>Nicknames and other spellings</Label>
            <Input id={`aliases-${id}`} name="aliases" defaultValue={aliases.join(", ")} className="h-12 text-base" />
          </div>
          {state && !state.ok && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}
          <Button type="submit" disabled={pending} className="h-12 w-full text-base">
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
