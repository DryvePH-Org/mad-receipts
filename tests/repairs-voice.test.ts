import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { transcribeAudio } = await import("@/lib/repairs/bot/elevenlabs");

describe("repairs voice", () => {
  beforeEach(() => { process.env.ELEVENLABS_API_KEY = "test-key"; });
  afterEach(() => { delete process.env.ELEVENLABS_API_KEY; });
  const ok = (text: string) => new Response(JSON.stringify({ text }), { status: 200 });

  it("sends the audio with the key and returns the words", async () => {
    const f = vi.fn(async () => ok("  flat tire sa NAS 3571  "));
    expect(await transcribeAudio(new Uint8Array([1, 2]), "audio/ogg", "voice.ogg", f as unknown as typeof fetch)).toBe("flat tire sa NAS 3571");
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("test-key");
  });
  it("tries again on a server trouble", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("", { status: 503 })).mockResolvedValueOnce(ok("done na"));
    expect(await transcribeAudio(new Uint8Array([1]), "audio/ogg", "v.ogg", f as unknown as typeof fetch)).toBe("done na");
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("does not retry a refused key", async () => {
    const f = vi.fn(async () => new Response("", { status: 401 }));
    await expect(transcribeAudio(new Uint8Array([1]), "audio/ogg", "v.ogg", f as unknown as typeof fetch)).rejects.toThrow("401");
    expect(f).toHaveBeenCalledTimes(1);
  });
});
