// The switch of the repairs bot's Telegram webhook (the go-live step, done once, by the owner's word).
// Telegram can send a bot's messages to ONE address only. Pointing the existing bot here takes it away from the old Python bot at the same moment;
// to go back, set the address the old bot used (this script prints it first, before changing anything).
//   REPAIRS_TELEGRAM_BOT_TOKEN=... npx jiti scripts/repairs-webhook.ts                  shows where the bot sends its messages now (changes nothing)
//   REPAIRS_TELEGRAM_BOT_TOKEN=... npx jiti scripts/repairs-webhook.ts --set <https url>  points it at the app (the old address is printed so it can be restored)
import { createHmac } from "node:crypto";

const token = process.env.REPAIRS_TELEGRAM_BOT_TOKEN;
if (!token) { console.error("Set REPAIRS_TELEGRAM_BOT_TOKEN for this run."); process.exit(1); }
const call = async (method: string, body: Record<string, unknown> = {}) => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json()) as { ok?: boolean; result?: unknown; description?: string };
  if (!json.ok) throw new Error(`${method}: ${json.description ?? res.status}`);
  return json.result as Record<string, unknown>;
};

async function main() {
  const info = await call("getWebhookInfo");
  console.log(`The bot sends its messages to: ${info.url || "(nowhere: it is polling)"}\nWaiting updates: ${info.pending_update_count ?? 0}${info.last_error_message ? `\nLast error: ${info.last_error_message}` : ""}`);
  const at = process.argv.indexOf("--set");
  if (at < 0) return;
  const url = process.argv[at + 1];
  if (!url?.startsWith("https://")) throw new Error("Give the https address after --set, e.g. https://mad.dryveph.io/api/repairs/telegram");
  console.log(`\nThe OLD address (to go back): ${info.url || "(none)"}`);
  const secret = createHmac("sha256", token!).update("mad-repairs-webhook").digest("hex").slice(0, 48);
  await call("setWebhook", { url, secret_token: secret, allowed_updates: ["message", "callback_query"] });
  console.log(`Done: the bot now sends its messages to ${url}.`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
