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
  if (r.status === 401) console.warn("[grokbot] callback rejected (not authorized)");
  return Response.json(r.body, { status: r.status });
}
