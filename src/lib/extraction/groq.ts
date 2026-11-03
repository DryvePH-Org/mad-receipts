import "server-only";
import Groq, { toFile } from "groq-sdk";

export const EXTRACTION_PROMPT = `You read a photo of a handwritten Philippine car-sale "Acknowledgement of Payment" form from Manila Auto Display (MAD).

Return ONLY a JSON object with exactly these keys:
{
  "receipt_no": "the printed red number after 'No.' at the top right",
  "receipt_date": "date at the top, as YYYY-MM-DD",
  "buyer_name": "'Received from'",
  "buyer_address": "'Postal address'",
  "buyer_contact": "'Contact no.'",
  "amount_words": "'The sum of PESOS', written in words, exactly as written",
  "amount": "the numeric amount after 'P' next to the words",
  "paper_payment_type": "earnest | partial | full",
  "make_type": "'Make/Type', e.g. 2021 Honda Civic",
  "plate_no": "'Plate No.'",
  "motor_no": "'Motor No.'",
  "chassis_no": "'Chassis No.'",
  "color": "'Color'",
  "agreed_price": "'Agreed price'",
  "less_payment": "'Less payment'",
  "balance": "'Balance' in the price breakdown",
  "payment_method": "cash | check",
  "check_no": "'Check no.' if paid by check",
  "bank_branch": "'Bank/Branch' if paid by check",
  "balance_words": "the words in 'Balance of ____', exactly as written",
  "balance_amount": "the number in '(P____)' after the balance words",
  "balance_due_date": "the date after 'shall be given on or before', as YYYY-MM-DD"
}

Rules:
- If a field is blank, crossed out, or you cannot read it with confidence, return null. NEVER guess or invent a value.
- Plate numbers: letters and digits only, no spaces or dashes.
- Amounts: digits only (a decimal point is allowed), no currency symbols, no commas. Example: 450000
- paper_payment_type: the option (earnest money / partial payment / full payment) that is underlined, circled or ticked. null if none is marked.
- payment_method: the option (cash / check) that has an X or check mark. null if none is marked.
- Dates: Philippine forms write month before day (11/02/2026 is November 2, 2026). Convert to YYYY-MM-DD.
- Ignore the preprinted header, footer remarks and signatures.`;

let client: Groq | null = null;

function groq(): Groq {
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not set");
  client ??= new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: 60_000, maxRetries: 2 });
  return client;
}

export function visionModel(): string {
  const model = process.env.GROQ_VISION_MODEL;
  if (!model) throw new Error("GROQ_VISION_MODEL is not set");
  return model;
}

/** Sends the photo to the Groq vision model and returns its raw JSON text. */
export async function callGroqVision(imageBytes: Uint8Array, mimeType: string): Promise<string> {
  const dataUrl = `data:${mimeType};base64,${Buffer.from(imageBytes).toString("base64")}`;

  const completion = await groq().chat.completions.create({
    model: visionModel(),
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract the fields from this form." },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  });

  return completion.choices[0]?.message?.content ?? "";
}

/** Speech-to-text model on Groq. */
export const transcriptionModel = () => process.env.GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3-turbo";

const AUDIO_EXTENSION: [RegExp, string][] = [
  [/mp4|m4a|aac/, "m4a"],
  [/ogg/, "ogg"],
  [/wav/, "wav"],
  [/mpeg|mp3/, "mp3"],
];

/** Turns a voice recording into text. `prompt` tells it which names to expect. */
export async function callGroqTranscription(bytes: Uint8Array, mimeType: string, prompt: string): Promise<string> {
  const extension = AUDIO_EXTENSION.find(([pattern]) => pattern.test(mimeType))?.[1] ?? "webm";
  const file = await toFile(Buffer.from(bytes), `voice.${extension}`, { type: mimeType });
  const result = await groq().audio.transcriptions.create({
    file,
    model: transcriptionModel(),
    prompt,
    temperature: 0,
    response_format: "json",
  });
  return result.text ?? "";
}

/** Text in, JSON text out, with the same model as the photo reading. */
export async function callGroqJson(system: string, user: string): Promise<string> {
  const completion = await groq().chat.completions.create({
    model: visionModel(),
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return completion.choices[0]?.message?.content ?? "";
}
