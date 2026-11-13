import "server-only";
import { GroqError } from "./groq";

// Grok (xAI) reading a picture, used for the car documents when XAI_API_KEY is set. Same contract as the Groq reader:
// one picture and some instructions in, one JSON object out. Errors reuse GroqError so the "busy / limit used up / try later"
// handling that already exists for the reader applies unchanged.
const BASE = "https://api.x.ai/v1";

export const grokConfigured = () => Boolean(process.env.XAI_API_KEY?.trim());
const model = () => process.env.XAI_VISION_MODEL?.trim().split(/\s+/)[0] || "grok-4";

export async function grokVisionJson(system: string, user: string, imageDataUrl: string): Promise<string> {
  const key = process.env.XAI_API_KEY?.trim();
  if (!key) throw new GroqError("Grok is not set up on this server yet (XAI_API_KEY is missing).");
  let last: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: model(), temperature: 0, max_tokens: 1500, response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: [{ type: "image_url", image_url: { url: imageDataUrl, detail: "high" } }, { type: "text", text: user }] },
          ],
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (res.status === 429) {
        const wait = Number(res.headers.get("retry-after")) || 0;
        if (attempt === 1 && wait > 0 && wait <= 20) { await new Promise((r) => setTimeout(r, wait * 1000)); continue; }
        throw new GroqError("The AI reader is busy right now (too many requests). Wait a minute and try again.");
      }
      if (res.status === 402 || res.status === 403) throw new GroqError("The Grok account cannot read right now (credit or access). Check the xAI account.");
      if (res.status >= 500) { last = new Error(`Grok ${res.status}`); continue; }
      if (!res.ok) throw new Error(`Grok ${res.status}`);
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { total_tokens?: number } };
      const used = body.usage?.total_tokens;
      if (used) console.info(`[vision] grok total=${used}`);
      return body.choices?.[0]?.message?.content ?? "";
    } catch (e) {
      if (e instanceof GroqError) throw e;
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("Grok failed");
}
