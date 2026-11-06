"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AskDialog } from "@/components/shared/ask-dialog";
import { Button } from "@/components/ui/button";
import { setUserActive } from "./actions";

/** Disable or enable an account. Disabling asks first. */
export function ActiveToggle({ userId, name, active, self }: { userId: string; name: string; active: boolean; self: boolean }) {
  const [ask, setAsk] = useState(false);
  const [pending, start] = useTransition();
  const run = (on: boolean) => start(async () => { const r = await setUserActive(userId, on); if (r.ok) toast.success(r.message); else toast.error(r.message); });
  if (self) return null;
  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => (active ? setAsk(true) : run(true))}>{active ? "Disable" : "Enable"}</Button>
      <AskDialog open={ask} onOpenChange={setAsk} title={`Disable ${name}?`} description="They will not be able to log in, and anything they have open stops working. Nothing is deleted. You can enable the account again." fields={[]} confirm="Disable account" danger onConfirm={async () => { run(false); }} />
    </>
  );
}
