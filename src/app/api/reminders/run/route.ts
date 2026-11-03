import { hasCronSecret } from "@/lib/cron";
import { manilaToday } from "@/lib/dates";
import { buildReminderMessage } from "@/lib/reminders";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTelegramClient } from "@/lib/telegram";

// Called once a day at 8:00 AM Manila time with CRON_SECRET. Sends one Telegram message listing
// the open deals whose balance is due today or already late. Sends nothing when none are.
export async function POST(request: Request) {
  if (!hasCronSecret(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const today = manilaToday();
  const { data, error } = await createAdminClient()
    .from("deal_summaries")
    .select("plate_no, buyer_name, balance, next_due_date")
    .eq("status", "open")
    .lte("next_due_date", today)
    .order("next_due_date", { ascending: true })
    .limit(500);
  if (error) {
    console.error("[reminders] could not load deals");
    return Response.json({ error: "Could not load the deals" }, { status: 500 });
  }

  const message = buildReminderMessage(
    data.flatMap((d) =>
      d.plate_no && d.buyer_name && d.next_due_date && d.balance !== null
        ? [{ plate_no: d.plate_no, buyer_name: d.buyer_name, balance: d.balance, due_date: d.next_due_date }]
        : [],
    ),
    today,
  );
  if (!message) return Response.json({ sent: false, due: 0 });

  try {
    await createTelegramClient().sendMessage(message);
  } catch (err) {
    console.error(`[reminders] telegram failed: ${err instanceof Error ? err.message : "unknown error"}`);
    return Response.json({ error: "Could not send the Telegram message" }, { status: 502 });
  }
  console.info(`[reminders] sent for ${data.length} deal(s)`);
  return Response.json({ sent: true, due: data.length });
}
