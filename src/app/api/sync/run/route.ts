import { hasCronSecret } from "@/lib/cron";
import { readSomePending } from "@/lib/docs/service";
import { dispatch } from "@/lib/grokbot/client";
import { defaultGrokbotDeps } from "@/lib/grokbot/store";
import { processDueJobs } from "@/lib/sync/process";

// Called by the scheduler every 5 minutes with CRON_SECRET.
export async function POST(request: Request) {
  if (!hasCronSecret(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const summary = await processDueJobs();
    // Car-document photos that are waiting to be read, a few each run. A problem here never stops the sync above.
    const docs = await readSomePending().catch((e) => { console.error(`[docs] background read failed: ${e instanceof Error ? e.message : "unknown"}`); return null; });
    // the grokbot queue: send what has room, give up what the bot never answered (a job added while the server restarted is picked up here)
    const bots = await dispatch(defaultGrokbotDeps()).catch(() => null);
    return Response.json({ ...summary, docs, bots });
  } catch (err) {
    console.error(`[sync] run failed: ${err instanceof Error ? err.message : "unknown error"}`);
    return Response.json({ error: "Sync run failed" }, { status: 500 });
  }
}
