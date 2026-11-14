import { after } from "next/server";
import { applyScanAnswer } from "@/lib/docs/bot-scan";
import { defaultGrokbotDeps } from "@/lib/grokbot/store";
import { receiveAnswer } from "@/lib/grokbot/client";

const MAX_BYTES = 512 * 1024;

// The grokbot posts the answer to a job here, with that job's own token as a Bearer key.
export async function POST(request: Request) {
  const text = await request.text().catch(() => "");
  if (text.length > MAX_BYTES) return Response.json({ ok: false, error: "too large" }, { status: 413 });
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { /* answered below as unauthorized */ }
  const auth = request.headers.get("authorization") ?? "";
  const bearer = /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, "") : "";
  const r = await receiveAnswer(body, bearer, defaultGrokbotDeps());
  const job = (typeof (body as { job_id?: unknown } | null)?.job_id === "string" ? (body as { job_id: string }).job_id : "?").replace(/[^a-z0-9_-]/gi, "").slice(0, 60);
  // one line per answer (the job id and the status only), so a lost answer can be traced
  console.info(`[grokbot] callback job=${job} status=${r.status}`);
  // a scan answer is turned into readings in the background; the bot is answered at once
  if (r.status === 200 && job.startsWith("docs_scan-")) after(() => applyScanAnswer(job).then(() => undefined, (e) => console.warn(`[docs] could not apply a scan answer: ${e instanceof Error ? e.message : "unknown"}`)));
  return Response.json(r.body, { status: r.status });
}
