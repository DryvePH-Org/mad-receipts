"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { connectLinkAction, disconnectAction, sendTestAction, setCategoryAction, setUpBotAction, type Result } from "./actions";

const say = (r: Result): void => { if (r.ok) toast.success(r.message); else toast.error(r.error); };

export function Connect({ connected, username, problem }: { connected: boolean; username: string | null; problem: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [link, setLink] = useState<{ url: string; bot: string; command: string } | null>(null);
  // after the link is shown, the page checks by itself every 4 seconds (for 3 minutes) and turns to "Connected" when Start was pressed
  useEffect(() => {
    if (!link || connected) return;
    const every = setInterval(() => router.refresh(), 4000), stop = setTimeout(() => clearInterval(every), 180_000);
    return () => { clearInterval(every); clearTimeout(stop); };
  }, [link, connected, router]);
  const copy = (text: string, what: string) => navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copied.`), () => toast.error("Could not copy: select the text and copy it."));
  return (
    <div className="space-y-3">
      {connected && <p>{problem ? <span className="text-destructive">{problem}</span> : `Connected${username ? ` as @${username}` : ""}.`}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => start(async () => {
          const r = await connectLinkAction();
          if (!r.ok) return say(r);
          if (r.url && r.bot && r.command) setLink({ url: r.url, bot: r.bot, command: r.command });
        })}>{pending ? <Loader2 className="animate-spin" /> : <Send />} {connected ? "Connect again" : "Connect Telegram"}</Button>
        {connected && <Button variant="outline" disabled={pending} onClick={() => start(async () => say(await sendTestAction()))}>Send me a test</Button>}
        {connected && <Button variant="outline" disabled={pending} onClick={() => start(async () => { say(await disconnectAction()); router.refresh(); })}>Disconnect</Button>}
        <Button variant="ghost" disabled={pending} onClick={() => router.refresh()}>I pressed Start: check</Button>
      </div>
      {link && !connected && (
        <div className="space-y-3 rounded-lg bg-muted/50 p-3">
          <p className="font-medium">Step 1: tap the button below. Telegram opens. Step 2: press <b>Start</b> at the bottom of the chat.</p>
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"><Send className="size-4" /> Open Telegram and press Start</a>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>If Telegram does not open: open the Telegram app, search <b>@{link.bot}</b>, open it, and send this message (the code works for 30 minutes):</p>
            <p className="break-all rounded bg-background p-2 font-mono text-foreground">{link.command}</p>
            <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => copy(link.command, "The message")}>Copy the message</Button><Button size="sm" variant="outline" onClick={() => copy(link.url, "The link")}>Copy the link</Button></div>
          </div>
        </div>
      )}
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
