"use client";

import { useState, useTransition } from "react";
import { Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { testGrokbotAction } from "./grokbot-actions";

/** Admin: proves each bot is connected (the message goes there and comes back). */
export function GrokbotPanel({ missing, separateScanner }: { missing: string[]; separateScanner: boolean }) {
  const [busy, start] = useTransition();
  const [which, setWhich] = useState<"scan" | "sheet" | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const test = (bot: "scan" | "sheet") => { setResult(null); setWhich(bot); start(async () => setResult(await testGrokbotAction(bot))); };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl p-3 text-sm ring-1 ring-foreground/10">
      <Bot className="size-4 text-muted-foreground" aria-hidden />
      <span className="font-medium">Grokbots</span>
      {missing.length ? <span className="text-amber-800 dark:text-amber-300">Not set up yet: {missing.join(", ")}</span> : <span className="text-muted-foreground">{separateScanner ? "Scanner and sheet editor" : "One bot does both jobs"}</span>}
      <Button type="button" size="sm" variant="outline" disabled={busy || missing.length > 0} onClick={() => test("sheet")}>{busy && which === "sheet" ? <Loader2 className="animate-spin" /> : null} Test the sheet editor</Button>
      {separateScanner && <Button type="button" size="sm" variant="outline" disabled={busy || missing.length > 0} onClick={() => test("scan")}>{busy && which === "scan" ? <Loader2 className="animate-spin" /> : null} Test the scanner</Button>}
      {busy && <span className="text-muted-foreground">Waiting for the bot… this can take a minute.</span>}
      {result && <span role="status" className={result.ok ? "text-emerald-800 dark:text-emerald-300" : "text-destructive"}>{result.message}</span>}
    </div>
  );
}
