import "server-only";
import { callGroqVision } from "./groq";
import { ExtractedReceipt } from "./schema";

export { ExtractedReceipt, toReceiptFields } from "./schema";

export class ExtractionError extends Error {}

/** The fields read from the photo, plus any words about financing or trade-in the paper carries. */
export interface PhotoReading {
  fields: ExtractedReceipt;
  hints: string;
}

// Groq accepts base64 images up to 4 MB per request.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * Reads a receipt photo into structured fields. The only place that knows which
 * AI model is used: swap the model by editing groq.ts.
 * Retries once if the model's answer is not a JSON object.
 */
export async function extractReceipt(
  imageBytes: Uint8Array,
  mimeType = "image/jpeg",
): Promise<PhotoReading> {
  if (imageBytes.byteLength === 0) throw new ExtractionError("The photo is empty.");
  if (imageBytes.byteLength * (4 / 3) > MAX_IMAGE_BYTES) {
    throw new ExtractionError("The photo is too large to read.");
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await callGroqVision(imageBytes, mimeType);
    const json = parseJson(raw);
    const parsed = ExtractedReceipt.safeParse(json);
    if (parsed.success) {
      const hints = (json as Record<string, unknown>).terms_hints;
      return { fields: parsed.data, hints: typeof hints === "string" ? hints.trim().slice(0, 300) : "" };
    }
  }
  throw new ExtractionError("The AI did not return a readable answer.");
}

function parseJson(raw: string): unknown {
  try {
    // Some models wrap JSON in a code fence even in JSON mode.
    return JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
  } catch {
    return undefined;
  }
}
