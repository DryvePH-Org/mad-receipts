import "server-only";
import type { SpeechSegment } from "./speech";

// Groq's speech-to-text (Whisper) and text model (gpt-oss), called directly over HTTPS.
const BASE = "https://api.groq.com/openai/v1";

// The full model hears Filipino and mixed speech better than the faster "turbo" one; it costs a few cents more per hour of audio.
export const transcriptionModel = () => process.env.GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3";
/** Leave empty so Whisper decides per recording (best for Taglish); set GROQ_TRANSCRIPTION_LANGUAGE=tl or en to force one. */
const transcriptionLanguage = () => process.env.GROQ_TRANSCRIPTION_LANGUAGE?.trim() || "";
export const reasoningModel = () => process.env.GROQ_REASONING_MODEL || "openai/gpt-oss-120b";

/** A problem with Groq that staff can act on; the message is safe to show them. */
export class GroqError extends Error {}

function key(): string {
  const k = process.env.GROQ_API_KEY;
  if (!k) throw new GroqError("Voice is not set up on this server yet (GROQ_API_KEY is missing). Type the details instead.");
  return k;
}

async function call(path: string, init: RequestInit): Promise<unknown> {
  let last: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${key()}` }, signal: AbortSignal.timeout(60_000) });
      if (res.status === 429) {
        // The free plan allows only a few calls a minute: wait the time Groq asks for (briefly), once.
        const wait = Number(res.headers.get("retry-after")) || 0;
        if (attempt === 1 && wait > 0 && wait <= 20) { await new Promise((r) => setTimeout(r, wait * 1000)); continue; }
        throw new GroqError("Voice is busy right now (too many requests). Wait a minute and try again, or type the details.");
      }
      if (res.status >= 500) { last = new Error(`Groq ${res.status}`); continue; }
      if (!res.ok) throw new Error(`Groq ${res.status}`);
      return await res.json();
    } catch (e) {
      if (e instanceof GroqError) throw e;
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("Groq failed");
}

const EXTENSION: [RegExp, string][] = [[/mp4|m4a|aac/, "m4a"], [/ogg/, "ogg"], [/wav/, "wav"], [/mpeg|mp3/, "mp3"]];

/** Whisper: the recording as text, with its confidence for each segment (so noise can be dropped, see speech.ts). */
export async function transcribe(bytes: Uint8Array, mimeType: string, prompt: string): Promise<{ text: string; segments: SpeechSegment[] }> {
  const ext = EXTENSION.find(([p]) => p.test(mimeType))?.[1] ?? "webm";
  const body = new FormData();
  body.set("file", new Blob([bytes as BlobPart], { type: mimeType }), `voice.${ext}`);
  body.set("model", transcriptionModel());
  body.set("prompt", prompt.slice(0, 800));
  body.set("temperature", "0");
  body.set("response_format", "verbose_json");
  if (transcriptionLanguage()) body.set("language", transcriptionLanguage());
  const r = (await call("/audio/transcriptions", { method: "POST", body })) as { text?: string; segments?: SpeechSegment[] };
  return { text: r.text ?? "", segments: r.segments ?? [] };
}

/** gpt-oss: text in, one JSON object out. */
export async function chatJson(system: string, user: string): Promise<string> {
  const r = (await call("/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: reasoningModel(), temperature: 0, reasoning_effort: "medium", max_completion_tokens: 3500,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  })) as { choices?: { message?: { content?: string } }[] };
  return r.choices?.[0]?.message?.content ?? "";
}
