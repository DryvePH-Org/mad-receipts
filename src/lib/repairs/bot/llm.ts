import "server-only";
import { chatJson } from "@/lib/voice/groq";

// The model that reads a report. Anthropic (Claude) when ANTHROPIC_API_KEY is set (the most accurate for Taglish, and a report costs a fraction of a cent);
// otherwise the Groq model the receipt voice note already uses.
export async function readWithModel(system: string, user: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return chatJson(system, user);
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: process.env.REPAIRS_LLM_MODEL || "claude-haiku-5-5", max_tokens: 1500, temperature: 0, system, messages: [{ role: "user", content: user }] }),
        signal: AbortSignal.timeout(45_000),
      });
      if (res.status === 429 || res.status >= 500) { last = new Error(`Anthropic ${res.status}`); await new Promise((r) => setTimeout(r, 1500 * attempt)); continue; }
      if (!res.ok) throw new Error(`Anthropic ${res.status}`);
      const body = (await res.json()) as { content?: { type: string; text?: string }[] };
      return body.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("") ?? "";
    } catch (e) { last = e; }
  }
  throw last instanceof Error ? last : new Error("The reader failed");
}
