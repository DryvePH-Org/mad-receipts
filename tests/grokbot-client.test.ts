import { describe, expect, it } from "vitest";
import { botOf, dispatch, enqueueJob, grokbotConfig, grokbotMissing, GrokbotError, lineOf, priorityOf, receiveAnswer, sendJob, tokenFor, tokenMatches, type BotName, type GrokbotConfig, type JobRow, type JobStore } from "@/lib/grokbot/client";

const config: GrokbotConfig = { webhookUrl: "https://bot.example.test/hook", webhookSecret: "bot-key", callbackSecret: "cb-secret", callbackBase: "https://app.example.test" };

function memoryStore() {
  type Row = JobRow & { request: unknown; bot: BotName; priority: number; plate: string | null; created: number; started: number | null };
  const rows = new Map<string, Row>();
  let tick = 0;
  const store: JobStore = {
    async create(j) { rows.set(j.id, { id: j.id, action: j.action, status: "queued", result: null, error: null, request: j.request, bot: j.bot, priority: j.priority, plate: j.plate, created: ++tick, started: null }); },
    async get(id) { return rows.get(id) ?? null; },
    async complete(id, result, ok, error) {
      const r = rows.get(id);
      if (!r) return "unknown";
      if (r.status === "done" || r.status === "failed") return "already";
      Object.assign(r, { status: ok ? "done" : "failed", result, error });
      return "stored";
    },
    async claim(bot, limit) {
      const waiting = [...rows.values()].filter((r) => r.bot === bot && r.status === "queued").sort((a, b) => b.priority - a.priority || a.created - b.created).slice(0, limit);
      for (const r of waiting) { r.status = "sent"; r.started = Date.now(); }
      return waiting.map((r) => ({ id: r.id, action: r.action, bot: r.bot, priority: r.priority, request: r.request as Record<string, unknown> }));
    },
    async running(bot, since) { return [...rows.values()].filter((r) => r.bot === bot && r.status === "sent" && (r.started ?? 0) >= since.getTime()).length; },
    async expire(bot, before) {
      const old = [...rows.values()].filter((r) => r.bot === bot && r.status === "sent" && (r.started ?? 0) < before.getTime());
      for (const r of old) Object.assign(r, { status: "failed", error: "The bot did not answer in time." });
      return old.map((r) => r.id);
    },
  };
  return { store, rows };
}
const noWait = { sleep: async () => undefined, pollMs: 1 };

describe("the grokbot settings", () => {
  it("need the webhook, its key, a callback secret and the app's address; BRIDGE_* work as the webhook", () => {
    expect(grokbotConfig({})).toBeNull();
    expect(grokbotConfig({ BRIDGE_URL: "https://b", BRIDGE_SECRET: "k", GROKBOT_CALLBACK_SECRET: "c", APP_BASE_URL: "https://app/" })).toEqual({ webhookUrl: "https://b", webhookSecret: "k", callbackSecret: "c", callbackBase: "https://app" });
    expect(grokbotMissing({ BRIDGE_URL: "https://b", BRIDGE_SECRET: "k" })).toEqual(["GROKBOT_CALLBACK_SECRET", "APP_BASE_URL"]);
  });
  it("a token is good for its own job only", () => {
    const t = tokenFor("cb-secret", "ping-0123456789");
    expect(tokenMatches("cb-secret", "ping-0123456789", t)).toBe(true);
    expect(tokenMatches("cb-secret", "ping-aaaaaaaaaa", t)).toBe(false);
    expect(tokenMatches("other", "ping-0123456789", t)).toBe(false);
    expect(tokenMatches("cb-secret", "ping-0123456789", "")).toBe(false);
  });
});

describe("sending a job", () => {
  /** A bot that answers right away through the callback, like the real one does after its run. */
  const answering = (m: ReturnType<typeof memoryStore>, reply: (job: Record<string, unknown>) => Record<string, unknown>) =>
    (async (_url: string, init: RequestInit) => {
      const job = JSON.parse(String(init.body));
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer bot-key");
      queueMicrotask(() => { void receiveAnswer(reply(job), job.callback_token, { store: m.store, config }); });
      return new Response(JSON.stringify({ success: true, runUuid: "r1" }));
    }) as unknown as typeof fetch;

  it("posts the job with the callback address and its own token, and returns the bot's answer", async () => {
    const m = memoryStore();
    let sent: Record<string, unknown> = {};
    const r = await sendJob("ping", { plate: "NBU4875" }, { store: m.store, config, rand: () => "0123456789", fetch: answering(m, (job) => { sent = job; return { ok: true, job_id: job.job_id, action: "ping", pong: true }; }), ...noWait }, { sheetId: "sheet-1" });
    expect(r).toMatchObject({ jobId: "ping-0123456789", result: { pong: true } });
    expect(sent).toMatchObject({ job_id: "ping-0123456789", action: "ping", plate: "NBU4875", sheet_id: "sheet-1", callback_url: "https://app.example.test/api/grokbot/callback" });
    expect(sent.callback_token).toBe(tokenFor("cb-secret", "ping-0123456789"));
    expect(sent.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("keeps a copy of the job without its token", async () => {
    const m = memoryStore();
    await sendJob("ping", {}, { store: m.store, config, rand: () => "0123456789", fetch: answering(m, (j) => ({ ok: true, job_id: j.job_id })), ...noWait });
    expect(JSON.stringify(m.rows.get("ping-0123456789")!.request)).not.toContain("callback_token");
  });
  it("says so when the bot reports a problem", async () => {
    const m = memoryStore();
    await expect(sendJob("set_status", {}, { store: m.store, config, fetch: answering(m, (j) => ({ ok: false, job_id: j.job_id, error: "wrong sheet" })), ...noWait })).rejects.toThrow("wrong sheet");
  });
  it("explains a refused key, an unreachable bot, and a missing set-up", async () => {
    const m = memoryStore();
    const status = (n: number) => (async () => new Response("{}", { status: n })) as unknown as typeof fetch;
    await expect(sendJob("ping", {}, { store: m.store, config, fetch: status(401), ...noWait })).rejects.toThrow(/refused our key/);
    await expect(sendJob("ping", {}, { store: m.store, config, fetch: status(500), ...noWait })).rejects.toThrow(/said 500/);
    await expect(sendJob("ping", {}, { store: m.store, config, fetch: (async () => { throw new Error("down"); }) as unknown as typeof fetch, ...noWait })).rejects.toThrow(/Could not reach/);
    await expect(sendJob("ping", {}, { store: m.store, config: null })).rejects.toBeInstanceOf(GrokbotError);
  });
  it("stops waiting after the time limit, and a late answer is still stored", async () => {
    const m = memoryStore();
    let job: Record<string, unknown> = {};
    const silent = (async (_u: string, init: RequestInit) => { job = JSON.parse(String(init.body)); return new Response("{}"); }) as unknown as typeof fetch;
    await expect(sendJob("ping", {}, { store: m.store, config, fetch: silent, ...noWait }, { timeoutMs: 5 })).rejects.toThrow(/did not answer in time/);
    const late = await receiveAnswer({ ok: true, job_id: job.job_id, pong: true }, String(job.callback_token), { store: m.store, config });
    expect(late.status).toBe(200);
    expect(m.rows.get(String(job.job_id))!.status).toBe("done");
  });
});

describe("receiving an answer", () => {
  it("refuses a wrong token, an unknown job and a second answer", async () => {
    const m = memoryStore();
    await m.store.create({ id: "ping-0123456789", action: "ping", bot: "sheet", priority: 8, plate: null, request: {}, createdBy: null });
    const good = tokenFor("cb-secret", "ping-0123456789");
    expect((await receiveAnswer({ ok: true, job_id: "ping-0123456789" }, "nope", { store: m.store, config })).status).toBe(401);
    expect((await receiveAnswer({ ok: true }, good, { store: m.store, config })).status).toBe(401);
    expect((await receiveAnswer("text", good, { store: m.store, config })).status).toBe(401);
    expect((await receiveAnswer({ ok: true, job_id: "ping-ffffffffff" }, tokenFor("cb-secret", "ping-ffffffffff"), { store: m.store, config })).status).toBe(404);
    expect((await receiveAnswer({ ok: true, job_id: "ping-0123456789" }, good, { store: m.store, config })).status).toBe(200);
    expect((await receiveAnswer({ ok: true, job_id: "ping-0123456789" }, good, { store: m.store, config })).status).toBe(409);
    expect((await receiveAnswer({ ok: true, job_id: "ping-0123456789" }, good, { store: m.store, config: null })).status).toBe(401);
  });
});

describe("the freeze and the bot", () => {
  it("never sends a job that writes to a sheet while Google Sheets are frozen, but reads and pings go", async () => {
    const { vi } = await import("vitest");
    vi.stubEnv("SHEETS_WRITES", "");
    try {
      const m = memoryStore();
      const fetchMock = vi.fn(async () => new Response("{}"));
      await expect(sendJob("docs_update", { plate: "NBU4875" }, { store: m.store, config, fetch: fetchMock as unknown as typeof fetch, ...noWait })).rejects.toThrow(/frozen/);
      await expect(sendJob("docs_handoff", {}, { store: m.store, config, fetch: fetchMock as unknown as typeof fetch, ...noWait })).rejects.toThrow(/frozen/);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(m.rows.size).toBe(0); // nothing recorded either
      await expect(sendJob("docs_row", {}, { store: m.store, config, fetch: fetchMock as unknown as typeof fetch, ...noWait }, { timeoutMs: 1 })).rejects.toThrow(/in time/); // a read is sent
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllEnvs(); }
  });
  it("with SHEETS_WRITES=docs, the Docs Bible jobs are sent but other sheet jobs are not", async () => {
    const { vi } = await import("vitest");
    vi.stubEnv("SHEETS_WRITES", "docs");
    try {
      const m = memoryStore();
      const fetchMock = vi.fn(async () => new Response("{}"));
      await expect(sendJob("set_unit_status", {}, { store: m.store, config, fetch: fetchMock as unknown as typeof fetch, ...noWait })).rejects.toThrow(/frozen/);
      expect(fetchMock).not.toHaveBeenCalled();
      await expect(sendJob("docs_update", {}, { store: m.store, config, fetch: fetchMock as unknown as typeof fetch, ...noWait }, { timeoutMs: 1 })).rejects.toThrow(/in time/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllEnvs(); }
  });
});

describe("the queue and the two bots", () => {
  const withScan: GrokbotConfig = { ...config, scan: { webhookUrl: "https://scanner.example.test/hook", webhookSecret: "scan-key" } };
  const recorder = () => { const calls: { url: string; auth: string; body: Record<string, unknown> }[] = []; const fetchMock = (async (url: string, init: RequestInit) => { calls.push({ url, auth: (init.headers as Record<string, string>).Authorization, body: JSON.parse(String(init.body)) }); return new Response("{}"); }) as unknown as typeof fetch; return { calls, fetchMock }; };

  it("sends photos to the scanner and everything else to the sheet bot, each with its own key", async () => {
    const m = memoryStore(), { calls, fetchMock } = recorder();
    const deps = { store: m.store, config: withScan, fetch: fetchMock, ...noWait };
    await enqueueJob("docs_scan", { plate: "NBU4875", files: [] }, deps);
    await enqueueJob("docs_row", { plate: "NBU4875" }, deps);
    expect(calls.map((c) => [c.url, c.auth])).toEqual([["https://scanner.example.test/hook", "Bearer scan-key"], ["https://bot.example.test/hook", "Bearer bot-key"]]);
    expect(botOf("docs_scan")).toBe("scan");
    expect(botOf("docs_update")).toBe("sheet");
  });
  it("uses the main bot for scanning when there is no separate scanner", async () => {
    const m = memoryStore(), { calls, fetchMock } = recorder();
    await enqueueJob("docs_scan", { plate: "NBU4875" }, { store: m.store, config, fetch: fetchMock, ...noWait });
    expect(calls[0].url).toBe("https://bot.example.test/hook");
    expect(lineOf(config, "scan").webhookSecret).toBe("bot-key");
  });
  it("the sheet bot does one job at a time: the next waits until the first is answered", async () => {
    const m = memoryStore(), { calls, fetchMock } = recorder();
    const deps = { store: m.store, config, fetch: fetchMock, ...noWait };
    const a = await enqueueJob("docs_row", { plate: "AAA1111" }, deps);
    const b = await enqueueJob("docs_row", { plate: "BBB2222" }, deps);
    expect(calls).toHaveLength(1);
    expect(m.rows.get(b.jobId)!.status).toBe("queued");
    await receiveAnswer({ ok: true, job_id: a.jobId }, tokenFor("cb-secret", a.jobId), deps);
    await dispatch(deps); // what the callback does after an answer
    expect(calls).toHaveLength(2);
    expect(m.rows.get(b.jobId)!.status).toBe("sent");
  });
  it("lets the scanner run as many at once as allowed", async () => {
    const m = memoryStore(), { calls, fetchMock } = recorder();
    const deps = { store: m.store, config, capacity: { scan: 2, sheet: 1 }, fetch: fetchMock, ...noWait };
    for (const p of ["AAA1111", "BBB2222", "CCC3333"]) await enqueueJob("docs_scan", { plate: p }, deps);
    expect(calls).toHaveLength(2);
  });
  it("sends a write before a scan, and a read someone waits for before a scan, when they wait for the same bot", async () => {
    const m = memoryStore(), { calls, fetchMock } = recorder();
    const deps = { store: m.store, config, fetch: fetchMock, ...noWait };
    const busy = await enqueueJob("docs_row", { plate: "AAA1111" }, deps); // takes the only place
    const scan = await enqueueJob("docs_scan", { plate: "BBB2222" }, deps); // another bot
    expect(m.rows.get(scan.jobId)!.status).toBe("sent");
    const low = await enqueueJob("ping", {}, deps), high = await enqueueJob("docs_row", { plate: "CCC3333" }, deps);
    void low; void high;
    await receiveAnswer({ ok: true, job_id: busy.jobId }, tokenFor("cb-secret", busy.jobId), deps);
    await dispatch(deps);
    const next = calls[calls.length - 1].body;
    expect(next.action).toBe("ping"); // ping (8) goes before docs_row (5)
    expect(priorityOf("docs_update")).toBeGreaterThan(priorityOf("docs_row"));
    expect(priorityOf("docs_row")).toBeGreaterThan(priorityOf("docs_scan"));
  });
  it("gives up a job the bot never answered, so it cannot block the queue", async () => {
    const m = memoryStore(), { fetchMock } = recorder();
    const t0 = new Date("2026-11-14T00:00:00Z");
    const first = await enqueueJob("docs_row", {}, { store: m.store, config, fetch: fetchMock, now: () => t0, ...noWait });
    m.rows.get(first.jobId)!.started = t0.getTime();
    const second = await enqueueJob("docs_row", {}, { store: m.store, config, fetch: fetchMock, now: () => new Date(t0.getTime() + 9 * 60_000), ...noWait });
    void second;
    expect(m.rows.get(first.jobId)!.status).toBe("failed");
    expect(m.rows.get(first.jobId)!.error).toMatch(/did not answer/);
  });
  it("a webhook that refuses a job fails that job only", async () => {
    const m = memoryStore();
    const refuse = (async () => new Response("{}", { status: 403 })) as unknown as typeof fetch;
    const deps = { store: m.store, config, fetch: refuse, ...noWait };
    const a = await enqueueJob("docs_row", {}, deps);
    expect(m.rows.get(a.jobId)).toMatchObject({ status: "failed", error: expect.stringMatching(/refused our key/) });
    await expect(sendJob("docs_row", {}, deps)).rejects.toThrow(/refused our key/);
  });
});
