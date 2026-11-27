"use client";

import { useState, useTransition } from "react";
import { Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BOTS, type BotName } from "@/lib/grokbot/client";
import { BOT_NAME } from "@/lib/grokbot/labels";
import { testGrokbotAction } from "./grokbot-actions";

/** Admin: proves each scanner is connected (the message goes there and comes back). */
export function GrokbotPanel({ missing }: { missing: string[] }) {
  const [busy, start] = useTransition();
  const [running, setRunning] = useState<BotName | null>(null);
  const [result, setResult] = useState<{ bot: BotName; ok: boolean; message: string } | null>(null);
  const test = (bot: BotName) => { setResult(null); setRunning(bot); start(async () => { const r = await testGrokbotAction(bot); setResult({ bot, ...r }); setRunning(null); }); };
  return (
    <div className="space-y-2 rounded-xl p-3 text-sm ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center gap-3">
        <Bot className="size-4 text-muted-foreground" aria-hidden />
        <span className="font-medium">Scanner bots</span>
        {missing.length ? <span className="text-amber-800 dark:text-amber-300">Not set up yet: {missing.join(", ")}</span> : <span className="text-muted-foreground">Each one reads one stage of the car documents. One without its own address uses the first scanner&apos;s.</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {BOTS.map((bot) => (
          <Button key={bot} type="button" size="sm" variant="outline" disabled={busy || missing.length > 0} onClick={() => test(bot)}>{running === bot ? <Loader2 className="animate-spin" /> : null} Test: {BOT_NAME[bot]}</Button>
        ))}
      </div>
      {busy && <p className="text-muted-foreground">Waiting for the bot… this can take a minute.</p>}
      {result && <p role="status" className={result.ok ? "text-emerald-800 dark:text-emerald-300" : "text-destructive"}>{result.message}</p>}
    </div>
  );
}
