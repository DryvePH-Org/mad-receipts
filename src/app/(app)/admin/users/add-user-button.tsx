"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { ResponsiveDialog } from "@/components/shared/responsive-dialog";
import { Button } from "@/components/ui/button";
import { CreateUserForm } from "./create-user-form";

/** The add-user form stays out of sight until it is asked for. */
export function AddUserButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><UserPlus /> Add a user</Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title="Add a user" description="They can log in right away with the temporary password. Ask them to change it.">
        <CreateUserForm onDone={() => setOpen(false)} />
      </ResponsiveDialog>
    </>
  );
}
