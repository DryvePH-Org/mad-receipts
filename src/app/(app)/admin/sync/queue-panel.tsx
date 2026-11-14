import { Bot } from "lucide-react";
import { Pill, type Tone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { BOT_NAME, workLabel } from "@/lib/grokbot/labels";
import { queueSnapshot, type QueueRow } from "@/lib/grokbot/store";
import { cancelQueuedJobAction, retryScanAction } from "./grokbot-actions";

const dur = (seconds: number | null) => (seconds === null ? "" : seconds < 90 ? `${seconds}s` : `${Math.round(seconds / 60)} min`);
const TONE: Record<string, Tone> = { queued: "amber", sent: "blue", done: "emerald", failed: "red" };
const LABEL: Record<string, string> = { queued: "Waiting", sent: "With the bot", done: "Done", failed: "Failed" };

/** What the bots are doing, what is waiting in line for each, and what just finished. */
export async function QueuePanel() {
  const { active, recent } = await queueSnapshot().catch(() => ({ active: [] as QueueRow[], recent: [] as QueueRow[] }));
  const byBot = (bot: "scan" | "sheet") => active.filter((j) => j.bot === bot);
  const order = (list: QueueRow[]) => [...list].sort((a, b) => (a.status === b.status ? b.priority - a.priority || a.createdAt.localeCompare(b.createdAt) : a.status === "sent" ? -1 : 1));
  return (
    <section className="space-y-3 rounded-xl p-4 ring-1 ring-foreground/10" aria-label="Grokbot queue">
      <h2 className="flex items-center gap-2 text-base font-medium"><Bot className="size-4" aria-hidden /> Grokbot queue</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {(["sheet", "scan"] as const).map((bot) => {
          const list = order(byBot(bot));
          return (
            <div key={bot} className="space-y-2">
              <p className="text-sm font-medium">{BOT_NAME[bot]} <span className="font-normal text-muted-foreground">{list.length ? `${list.filter((j) => j.status === "sent").length} running, ${list.filter((j) => j.status === "queued").length} waiting` : "idle"}</span></p>
              {list.length === 0 ? <p className="text-sm text-muted-foreground">Nothing to do.</p> : (
                <ul className="divide-y rounded-lg ring-1 ring-foreground/10">
                  {list.map((j, i) => (
                    <li key={j.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                      <Pill tone={TONE[j.status]}>{LABEL[j.status]}</Pill>
                      <span className="flex-1">{workLabel(j.action, j.status === "queued" ? "queued" : "sent", j.status === "queued" ? i + 1 - list.filter((x) => x.status === "sent").length : null)}{j.plate ? ` · ${j.plate}` : ""}</span>
                      <span className="text-xs text-muted-foreground">{j.status === "sent" ? `running ${dur(j.runSec)}` : `waiting ${dur(j.waitSec)}`}</span>
                      {j.status === "queued" && <form action={cancelQueuedJobAction}><input type="hidden" name="id" value={j.id} /><Button type="submit" size="sm" variant="ghost">Cancel</Button></form>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {recent.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">Last {recent.length} finished jobs</summary>
          <ul className="mt-2 divide-y rounded-lg ring-1 ring-foreground/10">
            {recent.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <Pill tone={TONE[j.status]}>{LABEL[j.status]}</Pill>
                <span className="flex-1">{BOT_NAME[j.bot]}: {j.action}{j.plate ? ` · ${j.plate}` : ""}{j.error ? <span className="block text-xs text-destructive">{j.error}</span> : null}</span>
                <span className="text-xs text-muted-foreground">{dur(j.runSec)}</span>
                {j.status === "failed" && j.action === "docs_scan" && j.plate && <form action={retryScanAction}><input type="hidden" name="plate" value={j.plate} /><Button type="submit" size="sm" variant="outline">Scan again</Button></form>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

