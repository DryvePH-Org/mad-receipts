import "server-only";
import sharp from "sharp";
import { crossCheck, type Uncertain } from "./crosscheck";
import { callGroqVision } from "./groq";
import { ExtractedReceipt } from "./schema";

export { ExtractedReceipt, toReceiptFields } from "./schema";

export class ExtractionError extends Error {}

/** The fields read from the photo, plus any words about financing or trade-in the paper carries. */
export interface PhotoReading {
  /** Fields both readings agreed on. Fields they disagreed on are blank, and listed in `uncertain`. */
  fields: ExtractedReceipt;
  hints: string;
  /** For each field the two readings disagreed on, the readings (as form text), to pick from. */
  uncertain: Uncertain;
  /** False when the second reading could not be done, so nothing was cross-checked. */
  checked: boolean;
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

  // Two independent readings, at the same time: the photo as uploaded, and a smaller copy read with
  // stricter instructions. If the second one cannot be done the first still stands, unchecked.
  const [first, second] = await Promise.allSettled([readOnce(imageBytes, mimeType, false, 2), readSmaller(imageBytes)]);
  if (first.status === "rejected") throw first.reason;
  const secondFields = second.status === "fulfilled" ? second.value : null;
  const { fields, uncertain } = crossCheck(first.value.fields, secondFields?.fields ?? null);
  return { fields, hints: first.value.hints, uncertain, checked: secondFields !== null };
}

async function readOnce(imageBytes: Uint8Array, mimeType: string, careful: boolean, attempts: number) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const raw = await callGroqVision(imageBytes, mimeType, careful);
    const json = parseJson(raw);
    const parsed = ExtractedReceipt.safeParse(json);
    if (parsed.success) {
      const hints = (json as Record<string, unknown>).terms_hints;
      return { fields: parsed.data, hints: typeof hints === "string" ? hints.trim().slice(0, 300) : "" };
    }
  }
  throw new ExtractionError("The AI did not return a readable answer.");
}

/** The second opinion: a smaller copy of the photo and the stricter instructions. */
async function readSmaller(imageBytes: Uint8Array) {
  const small = await sharp(imageBytes).rotate().resize({ width: 1100, height: 1100, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
  return readOnce(new Uint8Array(small), "image/jpeg", true, 1);
}

function parseJson(raw: string): unknown {
  try {
    // Some models wrap JSON in a code fence even in JSON mode.
    return JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
  } catch {
    return undefined;
  }
}
