"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AskDialog } from "@/components/shared/ask-dialog";
import { Button } from "@/components/ui/button";
import { deleteUser, setUserActive } from "./actions";

/** Disable or enable an account. Disabling asks first. */
export function ActiveToggle({ userId, name, active, self }: { userId: string; name: string; active: boolean; self: boolean }) {
  const [ask, setAsk] = useState(false);
  const [remove, setRemove] = useState(false);
  const [pending, start] = useTransition();
  const run = (on: boolean) => start(async () => { const r = await setUserActive(userId, on); if (r.ok) toast.success(r.message); else toast.error(r.message); });
  if (self) return null;
  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => (active ? setAsk(true) : run(true))}>{active ? "Disable" : "Enable"}</Button>
      <Button type="button" variant="outline" size="sm" disabled={pending} className="text-destructive" onClick={() => setRemove(true)}>Remove</Button>
      <AskDialog open={remove} onOpenChange={setRemove} title={`Remove ${name}?`} description="The account is deleted for good and cannot be brought back. This works only for someone who has not done anything in the app yet; otherwise it says so, and you can disable them instead." fields={[]} confirm="Yes, remove this account" danger onConfirm={async () => { const r = await deleteUser(userId); if (r.ok) toast.success(r.message); else return r.message; }} />
      <AskDialog open={ask} onOpenChange={setAsk} title={`Disable ${name}?`} description="They will not be able to log in, and anything they have open stops working. Nothing is deleted. You can enable the account again." fields={[]} confirm="Disable account" danger onConfirm={async () => { run(false); }} />
    </>
  );
}
