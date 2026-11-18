import { hasCronSecret } from "@/lib/cron";
import { readSomePending } from "@/lib/docs/service";
import { dispatch } from "@/lib/grokbot/client";
import { saveDailyCopy } from "@/lib/docsbible/export-server";
import { defaultGrokbotDeps } from "@/lib/grokbot/store";
import { runScheduled } from "@/lib/notify/schedule";
import { processDueJobs } from "@/lib/sync/process";

// Called by the scheduler every 5 minutes with CRON_SECRET.
export async function POST(request: Request) {
  if (!hasCronSecret(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // each part is tried on its own: one failing never stops the others (the daily copy of the Docs Bible must not wait for receipts)
    const part = async <T>(name: string, run: () => Promise<T>): Promise<T | null> => run().catch((e) => { console.error(`[sync] ${name} failed: ${e instanceof Error ? e.message : "unknown"}`); return null; });
    const summary = await part("receipt jobs", () => processDueJobs());
    // Car-document photos that are waiting to be read, a few each run.
    const docs = await part("background read", () => readSomePending());
    // the grokbot queue: send what has room, give up what the bot never answered (a job added while the server restarted is picked up here)
    const bots = await part("bot queue", () => dispatch(defaultGrokbotDeps()));
    // the Docs Bible is the only copy now: one saved CSV a day (a quick check when today's is already there)
    const backup = await part("daily copy", () => saveDailyCopy());
    // personal Telegram messages: the held ones, the morning digests, the problem alerts
    const notices = await part("notifications", () => runScheduled());
    return Response.json({ ...(summary ?? { error: "receipt jobs failed" }), docs, bots, backup, notices });
  } catch (err) {
    console.error(`[sync] run failed: ${err instanceof Error ? err.message : "unknown error"}`);
    return Response.json({ error: "Sync run failed" }, { status: 500 });
  }
}
