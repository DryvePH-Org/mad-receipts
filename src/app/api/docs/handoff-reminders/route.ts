import { hasCronSecret } from "@/lib/cron";
import { getSettings } from "@/lib/data";
import { runHandoffReminders } from "@/lib/docs/workflow";

// Called once a day with CRON_SECRET. One Telegram message lists the sold cars whose papers were handed off 3 or more days ago
// (and since the last reminder) and have not been marked as done. Sends nothing when none are due.
export async function POST(request: Request) {
  if (!hasCronSecret(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const to = (await getSettings()).print.transmittalReceiver || "the receiver";
    return Response.json(await runHandoffReminders(to));
  } catch (err) {
    console.error(`[docs] handoff reminders failed: ${err instanceof Error ? err.message : "unknown error"}`);
    return Response.json({ error: "Could not send the reminders" }, { status: 502 });
  }
}
