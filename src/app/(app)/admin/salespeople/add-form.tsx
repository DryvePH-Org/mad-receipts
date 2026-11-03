"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addSalesperson } from "./actions";

export function AddSalespersonForm() {
  const [state, action, pending] = useActionState(addSalesperson, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required maxLength={60} placeholder="David Santos" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="aliases">Nicknames and other spellings (optional)</Label>
        <Input id="aliases" name="aliases" placeholder="Dave, Dabid" />
        <p className="text-xs text-muted-foreground">
          Separate with commas. These help the voice recording understand how the name is said.
        </p>
      </div>
      {state && !state.ok && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Adding…" : "Add salesperson"}
      </Button>
    </form>
  );
}
