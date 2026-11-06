import { hasCronSecret } from "@/lib/cron";
import { emailEnabled } from "@/lib/pcf/email";
import { sendDailyDigest } from "@/lib/pcf/notifications/digest";

// Called once a day at 8:00 AM Manila time with CRON_SECRET. Emails each petty cash role a summary of
// what is waiting on them (reviews, flagged vouchers, replenishments, low balance); nothing to roles with nothing pending.
export async function POST(request: Request) {
  if (!hasCronSecret(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!emailEnabled()) return Response.json({ ok: true, skipped: "email is off" });
  try {
    const { recipients, stats } = await sendDailyDigest();
    return Response.json({ ok: true, recipients, stats });
  } catch {
    console.error("[pcf digest] failed");
    return Response.json({ error: "The daily summary failed" }, { status: 500 });
  }
}
