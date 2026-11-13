import { describe, expect, it } from "vitest";
import { grokbotConfig, grokbotMissing, GrokbotError, receiveAnswer, sendJob, tokenFor, tokenMatches, type GrokbotConfig, type JobRow, type JobStore } from "@/lib/grokbot/client";

const config: GrokbotConfig = { webhookUrl: "https://bot.example.test/hook", webhookSecret: "bot-key", callbackSecret: "cb-secret", callbackBase: "https://app.example.test" };

function memoryStore() {
  const rows = new Map<string, JobRow & { request: unknown }>();
  const store: JobStore = {
    async create(j) { rows.set(j.id, { id: j.id, action: j.action, status: "sent", result: null, error: null, request: j.request }); },
    async get(id) { return rows.get(id) ?? null; },
    async complete(id, result, ok, error) {
      const r = rows.get(id);
      if (!r) return "unknown";
      if (r.status !== "sent") return "already";
      Object.assign(r, { status: ok ? "done" : "failed", result, error });
      return "stored";
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
    await m.store.create({ id: "ping-0123456789", action: "ping", request: {}, createdBy: null });
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
