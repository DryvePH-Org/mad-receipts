// Every day at 8:00 AM Manila time (00:00 UTC): send the Telegram reminder for balances due.
export default async () => {
  const site = process.env.URL;
  if (!site || !process.env.CRON_SECRET) {
    console.error("[cron] reminders: URL or CRON_SECRET is missing");
    return;
  }
  const res = await fetch(`${site}/api/reminders/run`, { method: "POST", headers: { "x-cron-secret": process.env.CRON_SECRET } });
  console.info(`[cron] reminders responded ${res.status}`);
};

export const config = { schedule: "0 0 * * *" };
