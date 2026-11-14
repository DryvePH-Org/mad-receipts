import { createHmac, timingSafeEqual } from "node:crypto";
import { assertSheetsWritable } from "@/lib/google/freeze";

// The grokbot: a bot that reads and edits the Google Sheets. The app POSTs one JSON "job" to its webhook (with the webhook secret as a
// Bearer key); the bot does the work and POSTs its answer to the job's callback address (with the job's own token). The same pattern as
// the repairs bot. The job and its answer are kept in the grokbot_jobs table, so a late answer is never lost and everything can be audited.
//
// Every job goes through ONE queue. There are two bots: "scan" (reads the document photos) and "sheet" (reads and edits the Google Sheets). A job
// waits until its bot has a free place; the sheet bot does one thing at a time, so two edits never run together.

export class GrokbotError extends Error {}

/** Jobs that change a sheet. While the Google Sheets freeze is on they are never sent (reads still are). */
export const WRITE_ACTIONS: ReadonlySet<string> = new Set(["docs_update", "docs_handoff", "set_unit_status", "append_receipt_row"]);
/** Which freeze scope a write job falls under: the Docs Bible jobs have their own. */
const scopeOf = (action: string): "app" | "docs" => (action.startsWith("docs_") ? "docs" : "app");

export type BotName = "scan" | "sheet";
/** The scanner reads photos; every other job is the sheet bot's. */
export const botOf = (action: string): BotName => (action === "docs_scan" ? "scan" : "sheet");
/** Higher goes first: a person waiting for an answer, or a write, before a scan. */
export const priorityOf = (action: string): number => (action === "docs_update" || action === "docs_handoff" ? 10 : action === "ping" ? 8 : action === "docs_row" ? 5 : 0);
/** A job the bot has not answered after this long is given up, so it never blocks the queue. */
export const STALE_MS: Record<BotName, number> = { scan: 15 * 60_000, sheet: 8 * 60_000 };

export interface QueueJob { id: string; action: string; bot: BotName; priority: number; request: Record<string, unknown> }
export interface JobRow { id: string; action: string; status: "queued" | "sent" | "done" | "failed"; result: unknown; error: string | null }

/** Where jobs are kept. The server uses the database; the tests use memory. */
export interface JobStore {
  /** Adds a job, waiting in the queue. */
  create(job: { id: string; action: string; bot: BotName; priority: number; plate: string | null; request: unknown; createdBy: string | null }): Promise<void>;
  get(id: string): Promise<JobRow | null>;
  /** Stores the answer once. Returns false when the job is unknown or already has its answer. */
  complete(id: string, result: unknown, ok: boolean, error: string | null): Promise<"stored" | "unknown" | "already">;
  /** Takes up to `limit` waiting jobs of this bot (highest priority, then oldest) and marks them sent. */
  claim(bot: BotName, limit: number): Promise<QueueJob[]>;
  /** How many jobs of this bot were sent since `since` and have no answer yet. */
  running(bot: BotName, since: Date): Promise<number>;
  /** Gives up sent jobs of this bot older than `before` (no answer) and returns their ids. */
  expire(bot: BotName, before: Date): Promise<string[]>;
}

export interface BotLine { webhookUrl: string; webhookSecret: string }
export interface GrokbotConfig extends BotLine { callbackSecret: string; callbackBase: string; /** a separate scanner bot; without it the main bot does the scanning too */ scan?: BotLine }

/** Settings from the server's environment; BRIDGE_URL and BRIDGE_SECRET are accepted as the main bot's address and secret too. */
export function grokbotConfig(env: Record<string, string | undefined> = process.env): GrokbotConfig | null {
  const webhookUrl = (env.GROKBOT_WEBHOOK_URL || env.BRIDGE_URL || "").trim();
  const webhookSecret = (env.GROKBOT_WEBHOOK_SECRET || env.BRIDGE_SECRET || "").trim();
  const callbackSecret = (env.GROKBOT_CALLBACK_SECRET || "").trim();
  const callbackBase = (env.APP_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!(webhookUrl && webhookSecret && callbackSecret && callbackBase)) return null;
  const scanUrl = (env.GROKBOT_SCAN_WEBHOOK_URL || "").trim(), scanSecret = (env.GROKBOT_SCAN_WEBHOOK_SECRET || "").trim();
  return { webhookUrl, webhookSecret, callbackSecret, callbackBase, ...(scanUrl && scanSecret ? { scan: { webhookUrl: scanUrl, webhookSecret: scanSecret } } : {}) };
}

export const grokbotMissing = (env: Record<string, string | undefined> = process.env): string[] => [
  ...((env.GROKBOT_WEBHOOK_URL || env.BRIDGE_URL) ? [] : ["GROKBOT_WEBHOOK_URL"]),
  ...((env.GROKBOT_WEBHOOK_SECRET || env.BRIDGE_SECRET) ? [] : ["GROKBOT_WEBHOOK_SECRET"]),
  ...(env.GROKBOT_CALLBACK_SECRET ? [] : ["GROKBOT_CALLBACK_SECRET"]),
  ...(env.APP_BASE_URL ? [] : ["APP_BASE_URL"]),
];

/** The webhook a bot is reached at (the scanner has its own when set). */
export const lineOf = (c: GrokbotConfig, bot: BotName): BotLine => (bot === "scan" && c.scan ? c.scan : { webhookUrl: c.webhookUrl, webhookSecret: c.webhookSecret });

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

export interface SendOptions { timeoutMs?: number; pollMs?: number; createdBy?: string | null; sheetId?: string; plate?: string | null; priority?: number; /** send this job to a particular bot instead of the one its action belongs to (a connection test) */ bot?: BotName }
/** How many jobs each bot may run at once. The sheet bot does ONE at a time so two edits never overlap. */
export type Capacity = Record<BotName, number>;
export interface Deps { store: JobStore; config: GrokbotConfig | null; capacity?: Capacity; /** called for a job that failed without an answer (refused, unreachable or given up), so its owner can react */ onFailed?: (jobId: string) => Promise<unknown>; fetch?: typeof fetch; rand?: () => string; now?: () => Date; sleep?: (ms: number) => Promise<void> }
export const DEFAULT_CAPACITY: Capacity = { scan: 1, sheet: 1 };

/**
 * Sends the waiting jobs the bots have room for. Called when a job is added, when an answer arrives, and by the scheduler, so the queue
 * never stalls. A job whose webhook refuses it is marked failed (it never blocks the others).
 */
export async function dispatch(deps: Deps): Promise<{ sent: number }> {
  const { store, config } = deps;
  if (!config) return { sent: 0 };
  const now = deps.now?.() ?? new Date(), doFetch = deps.fetch ?? fetch;
  let sent = 0;
  for (const bot of ["sheet", "scan"] as const) {
    const before = new Date(now.getTime() - STALE_MS[bot]);
    for (const id of await store.expire(bot, before)) await deps.onFailed?.(id)?.catch(() => undefined);
    const free = (deps.capacity ?? DEFAULT_CAPACITY)[bot] - (await store.running(bot, before));
    if (free <= 0) continue;
    for (const job of await store.claim(bot, free)) {
      const line = lineOf(config, bot);
      const body = { ...job.request, callback_token: tokenFor(config.callbackSecret, job.id) };
      let res: Response | null = null;
      try { res = await doFetch(line.webhookUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${line.webhookSecret}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) }); } catch { /* handled below */ }
      if (res?.ok) { sent++; continue; }
      const why = !res ? "Could not reach the grokbot." : res.status === 401 || res.status === 403 ? "The grokbot refused our key." : `The grokbot webhook said ${res.status}.`;
      await store.complete(job.id, null, false, why);
      await deps.onFailed?.(job.id)?.catch(() => undefined);
    }
  }
  return { sent };
}

/**
 * Adds a job to the queue and returns at once; the answer arrives later at the callback and is kept in the jobs table. The job is sent as
 * soon as its bot has room. Use this for work that takes minutes.
 */
export async function enqueueJob(action: string, fields: Record<string, unknown>, deps: Deps, options: SendOptions = {}): Promise<{ jobId: string }> {
  const { store, config } = deps;
  if (!config) throw new GrokbotError("The grokbot is not connected on this server yet.");
  if (!/^[a-z_]{3,40}$/.test(action)) throw new GrokbotError("Bad action name.");
  if (WRITE_ACTIONS.has(action)) assertSheetsWritable(scopeOf(action)); // the freeze: a job that writes to a sheet is never queued
  const rand = deps.rand ?? (() => crypto.randomUUID().replace(/-/g, "").slice(0, 10));
  const jobId = jobIdOf(action, rand);
  const request = { job_id: jobId, action, today: (deps.now?.() ?? new Date()).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }), callback_url: callbackUrl(config), ...(options.sheetId ? { sheet_id: options.sheetId } : {}), ...fields };
  const plate = options.plate ?? (typeof fields.plate === "string" && /^[A-Z0-9]+$/.test(fields.plate) ? fields.plate : null);
  await store.create({ id: jobId, action, bot: options.bot ?? botOf(action), priority: options.priority ?? priorityOf(action), plate, request, createdBy: options.createdBy ?? null });
  await dispatch(deps).catch(() => undefined);
  return { jobId };
}

/** The same as enqueueJob (kept for the callers that start long work and do not wait). */
export const startJob = enqueueJob;

/**
 * Adds a job and waits for the bot's answer (including any time in the queue). Throws a GrokbotError whose message can be shown to staff.
 * A job the bot answers after the wait is still stored, so it is not lost.
 */
export async function sendJob(action: string, fields: Record<string, unknown>, deps: Deps, options: SendOptions = {}): Promise<{ jobId: string; result: Record<string, unknown> }> {
  const { jobId } = await enqueueJob(action, fields, deps, options);
  const { store } = deps;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const deadline = Date.now() + (options.timeoutMs ?? 120_000), poll = options.pollMs ?? 1500;
  for (let n = 1; ; n++) {
    const row = await store.get(jobId);
    if (row && (row.status === "done" || row.status === "failed")) {
      if (row.status === "failed") throw new GrokbotError(row.error ?? "The grokbot could not do it.");
      return { jobId, result: (row.result ?? {}) as Record<string, unknown> };
    }
    if (Date.now() >= deadline) throw new GrokbotError("The grokbot did not answer in time. It may still be working; check again in a minute.");
    await sleep(poll);
    if (row?.status === "queued" && n % 8 === 0) await dispatch(deps).catch(() => undefined); // a place may have freed up
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
