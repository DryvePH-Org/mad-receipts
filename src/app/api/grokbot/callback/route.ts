import { after } from "next/server";
import { applyScanAnswer } from "@/lib/docs/bot-scan";
import { dispatch } from "@/lib/grokbot/client";
import { defaultGrokbotDeps } from "@/lib/grokbot/store";
import { receiveAnswer, tokenMatches } from "@/lib/grokbot/client";

const MAX_BYTES = 512 * 1024;

// The grokbot posts the answer to a job here, with that job's own token as a Bearer key.
export async function POST(request: Request) {
  const text = await request.text().catch(() => "");
  if (text.length > MAX_BYTES) return Response.json({ ok: false, error: "too large" }, { status: 413 });
  let body: unknown = null, broken = false;
  try { body = JSON.parse(text); } catch { broken = true; }
  const auth = request.headers.get("authorization") ?? "";
  const bearer = /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, "") : "";
  const deps = defaultGrokbotDeps();
  if (broken) {
    // An answer that is not valid JSON (a stray bracket): say so, instead of "unauthorized", and close the job as failed so the queue moves on and the photos can be scanned again.
    const id = /"job_id"\s*:\s*"([a-z0-9_-]{1,80})"/i.exec(text)?.[1];
    if (id && deps.config && tokenMatches(deps.config.callbackSecret, id, bearer)) {
      await receiveAnswer({ job_id: id, ok: false, error: "The scanner's answer was not valid JSON (check the brackets). Scan again." }, bearer, deps);
      after(() => dispatch(deps).then(() => undefined, () => undefined));
      if (id.startsWith("docs_scan-")) after(() => applyScanAnswer(id).then(() => undefined, () => undefined));
    }
    console.info(`[grokbot] callback job=${id ?? "?"} status=400 not valid JSON`);
    return Response.json({ ok: false, error: "The answer is not valid JSON (check the brackets and quotes). The job was closed; it will be scanned again." }, { status: 400 });
  }
  const r = await receiveAnswer(body, bearer, deps);
  const job = (typeof (body as { job_id?: unknown } | null)?.job_id === "string" ? (body as { job_id: string }).job_id : "?").replace(/[^a-z0-9_-]/gi, "").slice(0, 60);
  // one line per answer (the job id and the status only), so a lost answer can be traced
  console.info(`[grokbot] callback job=${job} status=${r.status}`);
  // an answer frees a place: the next waiting job is sent
  if (r.status === 200) after(() => dispatch(deps).then(() => undefined, () => undefined));
  // a scan answer is turned into readings in the background; the bot is answered at once
  if (r.status === 200 && job.startsWith("docs_scan-")) after(() => applyScanAnswer(job).then(() => undefined, (e) => console.warn(`[docs] could not apply a scan answer: ${e instanceof Error ? e.message : "unknown"}`)));
  return Response.json(r.body, { status: r.status });
}
