import "server-only";

// Speech to text for the repairmen's voice notes (ElevenLabs, as the old bot did). Three tries on a network or server trouble; a refused key is not retried.
export const sttReady = (): boolean => !!process.env.ELEVENLABS_API_KEY;

export class TranscribeError extends Error {}

export async function transcribeAudio(audio: Uint8Array, mime = "audio/ogg", filename = "voice.ogg", fetcher: typeof fetch = fetch): Promise<string> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new TranscribeError("not set up");
  let last = "unknown";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const body = new FormData();
      body.set("model_id", process.env.ELEVENLABS_STT_MODEL || "scribe_v1");
      body.set("tag_audio_events", "false");
      body.set("file", new Blob([audio as BlobPart], { type: mime }), filename);
      const res = await fetcher("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": key }, body, signal: AbortSignal.timeout(90_000) });
      if (res.ok) return (((await res.json()) as { text?: string }).text ?? "").trim();
      last = `status ${res.status}`;
      if ([401, 403, 422].includes(res.status)) break;
    } catch (e) { last = e instanceof Error ? e.name : "error"; }
    await new Promise((r) => setTimeout(r, 800 * attempt));
  }
  throw new TranscribeError(last);
}
