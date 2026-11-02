import { hasCronSecret } from "@/lib/cron";
import { processDueJobs } from "@/lib/sync/process";

// Called by the scheduler every 5 minutes with CRON_SECRET.
export async function POST(request: Request) {
  if (!hasCronSecret(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return Response.json(await processDueJobs());
  } catch (err) {
    console.error(`[sync] run failed: ${err instanceof Error ? err.message : "unknown error"}`);
    return Response.json({ error: "Sync run failed" }, { status: 500 });
  }
}
