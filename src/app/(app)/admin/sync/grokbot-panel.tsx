"use client";

import { useState, useTransition } from "react";
import { Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { testGrokbotAction } from "./grokbot-actions";

/** Admin: one button that proves the grokbot is connected (the message goes there and comes back). */
export function GrokbotPanel({ missing }: { missing: string[] }) {
  const [busy, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl p-3 text-sm ring-1 ring-foreground/10">
      <Bot className="size-4 text-muted-foreground" aria-hidden />
      <span className="font-medium">Grokbot</span>
      {missing.length ? <span className="text-amber-800 dark:text-amber-300">Not set up yet: {missing.join(", ")}</span> : <span className="text-muted-foreground">Set up</span>}
      <Button type="button" size="sm" variant="outline" disabled={busy || missing.length > 0} onClick={() => { setResult(null); start(async () => setResult(await testGrokbotAction())); }}>
        {busy ? <Loader2 className="animate-spin" /> : null} Test the connection
      </Button>
      {busy && <span className="text-muted-foreground">Waiting for the bot… this can take a minute.</span>}
      {result && <span role="status" className={result.ok ? "text-emerald-800 dark:text-emerald-300" : "text-destructive"}>{result.message}</span>}
    </div>
  );
}
