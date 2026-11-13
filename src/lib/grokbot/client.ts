import { createHmac, timingSafeEqual } from "node:crypto";
import { assertSheetsWritable } from "@/lib/google/freeze";

// The grokbot: a bot that reads and edits the Google Sheets. The app POSTs one JSON "job" to its webhook (with the webhook secret as a
// Bearer key); the bot does the work and POSTs its answer to the job's callback address (with the job's own token). The same pattern as
// the repairs bot. The job and its answer are kept in the grokbot_jobs table, so a late answer is never lost and everything can be audited.

export class GrokbotError extends Error {}

/** Jobs that change a sheet. While the Google Sheets freeze is on they are never sent (reads still are). */
export const WRITE_ACTIONS: ReadonlySet<string> = new Set(["docs_update", "docs_handoff", "set_unit_status", "append_receipt_row"]);
/** Which freeze scope a write job falls under: the Docs Bible jobs have their own. */
const scopeOf = (action: string): "app" | "docs" => (action.startsWith("docs_") ? "docs" : "app");

export interface JobRow { id: string; action: string; status: "sent" | "done" | "failed"; result: unknown; error: string | null }

/** Where jobs are kept. The server uses the database; the tests use memory. */
export interface JobStore {
  create(job: { id: string; action: string; request: unknown; createdBy: string | null }): Promise<void>;
  get(id: string): Promise<JobRow | null>;
  /** Stores the answer once. Returns false when the job is unknown or already has its answer. */
  complete(id: string, result: unknown, ok: boolean, error: string | null): Promise<"stored" | "unknown" | "already">;
}

export interface GrokbotConfig { webhookUrl: string; webhookSecret: string; callbackSecret: string; callbackBase: string }

/** Settings from the server's environment; BRIDGE_URL and BRIDGE_SECRET are accepted as the webhook's address and secret too. */
export function grokbotConfig(env: Record<string, string | undefined> = process.env): GrokbotConfig | null {
  const webhookUrl = (env.GROKBOT_WEBHOOK_URL || env.BRIDGE_URL || "").trim();
  const webhookSecret = (env.GROKBOT_WEBHOOK_SECRET || env.BRIDGE_SECRET || "").trim();
  const callbackSecret = (env.GROKBOT_CALLBACK_SECRET || "").trim();
  const callbackBase = (env.APP_BASE_URL || "").trim().replace(/\/+$/, "");
  return webhookUrl && webhookSecret && callbackSecret && callbackBase ? { webhookUrl, webhookSecret, callbackSecret, callbackBase } : null;
}

export const grokbotMissing = (env: Record<string, string | undefined> = process.env): string[] => [
  ...((env.GROKBOT_WEBHOOK_URL || env.BRIDGE_URL) ? [] : ["GROKBOT_WEBHOOK_URL"]),
  ...((env.GROKBOT_WEBHOOK_SECRET || env.BRIDGE_SECRET) ? [] : ["GROKBOT_WEBHOOK_SECRET"]),
  ...(env.GROKBOT_CALLBACK_SECRET ? [] : ["GROKBOT_CALLBACK_SECRET"]),
  ...(env.APP_BASE_URL ? [] : ["APP_BASE_URL"]),
];

/** Every job gets its own callback token, good for that job only: a leaked token cannot answer any other job. */
export function tokenFor(callbackSecret: string, jobId: string): string {
  return createHmac("sha256", callbackSecret).update(jobId).digest("hex").slice(0, 48);
}

export function tokenMatches(callbackSecret: string, jobId: string, presented: string): boolean {
  if (!callbackSecret || !jobId) return false;
  const a = Buffer.from(presented || ""), b = Buffer.from(tokenFor(callbackSecret, jobId));
  return a.length === b.length && timingSafeEqual(a, b);
}

export const callbackUrl = (c: GrokbotConfig) => `${c.callbackBase}/api/grokbot/callback`;
const jobIdOf = (action: string, rand: () => string) => `${action.replace(/[^a-z_]/g, "").slice(0, 30)}-${rand()}`;

export interface SendOptions { timeoutMs?: number; pollMs?: number; createdBy?: string | null; sheetId?: string }
export interface Deps { store: JobStore; config: GrokbotConfig | null; fetch?: typeof fetch; rand?: () => string; now?: () => Date; sleep?: (ms: number) => Promise<void> }

/**
 * Sends a job and waits for the bot's answer. Throws a GrokbotError whose message can be shown to staff.
 * A job the bot answers after the wait is still stored, so it is not lost (the caller decides what to do next time).
 */
export async function sendJob(action: string, fields: Record<string, unknown>, deps: Deps, options: SendOptions = {}): Promise<{ jobId: string; result: Record<string, unknown> }> {
  const { store, config } = deps;
  if (!config) throw new GrokbotError("The grokbot is not connected on this server yet.");
  if (!/^[a-z_]{3,40}$/.test(action)) throw new GrokbotError("Bad action name.");
  if (WRITE_ACTIONS.has(action)) assertSheetsWritable(scopeOf(action)); // the freeze: a job that writes to a sheet is not sent
  const rand = deps.rand ?? (() => crypto.randomUUID().replace(/-/g, "").slice(0, 10));
  const jobId = jobIdOf(action, rand);
  const job = { job_id: jobId, action, today: (deps.now?.() ?? new Date()).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }), callback_url: callbackUrl(config), callback_token: tokenFor(config.callbackSecret, jobId), ...(options.sheetId ? { sheet_id: options.sheetId } : {}), ...fields };
  // the kept copy never holds the token
  const kept = { ...job } as Record<string, unknown>; delete kept.callback_token;
  await store.create({ id: jobId, action, request: kept, createdBy: options.createdBy ?? null });

  const doFetch = deps.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(config.webhookUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.webhookSecret}` }, body: JSON.stringify(job), signal: AbortSignal.timeout(30_000) });
  } catch {
    await store.complete(jobId, null, false, "Could not reach the grokbot.");
    throw new GrokbotError("Could not reach the grokbot. Try again in a moment.");
  }
  if (res.status === 401 || res.status === 403) { await store.complete(jobId, null, false, "The grokbot refused the key."); throw new GrokbotError("The grokbot refused our key. Check GROKBOT_WEBHOOK_SECRET."); }
  if (!res.ok) { await store.complete(jobId, null, false, `The grokbot webhook said ${res.status}.`); throw new GrokbotError(`The grokbot webhook said ${res.status}.`); }

  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const deadline = Date.now() + (options.timeoutMs ?? 120_000), poll = options.pollMs ?? 1500;
  for (;;) {
    const row = await store.get(jobId);
    if (row && row.status !== "sent") {
      if (row.status === "failed") throw new GrokbotError(row.error ?? "The grokbot could not do it.");
      return { jobId, result: (row.result ?? {}) as Record<string, unknown> };
    }
    if (Date.now() >= deadline) throw new GrokbotError("The grokbot did not answer in time. It may still be working; check again in a minute.");
    await sleep(poll);
  }
}

/** What the callback does with an answer. Returns the HTTP status to give the bot. */
export async function receiveAnswer(body: unknown, bearer: string, deps: Pick<Deps, "store" | "config">): Promise<{ status: number; body: { ok: boolean; error?: string } }> {
  const data = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  const jobId = typeof data?.job_id === "string" ? data.job_id.slice(0, 80) : "";
  if (!deps.config || !data || !tokenMatches(deps.config.callbackSecret, jobId, bearer)) return { status: 401, body: { ok: false, error: "unauthorized" } };
  const ok = data.ok === true;
  const error = ok ? null : (typeof data.error === "string" ? data.error : "The grokbot reported a problem.").slice(0, 500);
  const outcome = await deps.store.complete(jobId, data, ok, error);
  if (outcome === "unknown") return { status: 404, body: { ok: false, error: "unknown job" } };
  if (outcome === "already") return { status: 409, body: { ok: false, error: "already answered" } };
  return { status: 200, body: { ok: true } };
}
