"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { connectLinkAction, disconnectAction, sendTestAction, setCategoryAction, setUpBotAction, type Result } from "./actions";

const say = (r: Result): void => { if (r.ok) toast.success(r.message); else toast.error(r.error); };

export function Connect({ connected, username, problem }: { connected: boolean; username: string | null; problem: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      {connected && <p>{problem ? <span className="text-destructive">{problem}</span> : `Connected${username ? ` as @${username}` : ""}.`}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => start(async () => {
          const r = await connectLinkAction();
          if (!r.ok) return say(r);
          window.open(r.url, "_blank", "noopener");
          toast.success(r.message);
        })}>{pending ? <Loader2 className="animate-spin" /> : <Send />} {connected ? "Connect again" : "Connect Telegram"}</Button>
        {connected && <Button variant="outline" disabled={pending} onClick={() => start(async () => say(await sendTestAction()))}>Send me a test</Button>}
        {connected && <Button variant="outline" disabled={pending} onClick={() => start(async () => { say(await disconnectAction()); router.refresh(); })}>Disconnect</Button>}
        <Button variant="ghost" disabled={pending} onClick={() => router.refresh()}>I pressed Start: check</Button>
      </div>
    </div>
  );
}

export function Toggle({ category, label, on }: { category: string; label: string; on: boolean }) {
  const [value, setValue] = useState(on);
  const [pending, start] = useTransition();
  return (
    <label className="flex shrink-0 items-center gap-2 text-sm">
      <input type="checkbox" className="size-4" checked={value} disabled={pending} aria-label={label} onChange={(e) => {
        const next = e.target.checked; setValue(next);
        start(async () => { const r = await setCategoryAction(category, next); if (!r.ok) { setValue(!next); say(r); } });
      }} />
      {value ? "On" : "Off"}
    </label>
  );
}

export function AdminBot({ done }: { done: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <Button variant={done ? "outline" : "default"} disabled={pending} onClick={() => start(async () => { say(await setUpBotAction()); router.refresh(); })}>{pending && <Loader2 className="animate-spin" />} {done ? "Set up the bot again" : "Set up the bot"}</Button>;
}
