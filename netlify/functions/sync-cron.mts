// Every 5 minutes: run the Drive / Sheets / Telegram / inventory jobs that are due or failed.
export default async () => {
  const site = process.env.URL;
  if (!site || !process.env.CRON_SECRET) {
    console.error("[cron] sync: URL or CRON_SECRET is missing");
    return;
  }
  const res = await fetch(`${site}/api/sync/run`, { method: "POST", headers: { "x-cron-secret": process.env.CRON_SECRET } });
  console.info(`[cron] sync responded ${res.status}`);
};

export const config = { schedule: "*/5 * * * *" };
