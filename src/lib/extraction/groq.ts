import "server-only";
import Groq, { toFile } from "groq-sdk";
import { manilaToday } from "@/lib/dates";

/**
 * The instructions for reading a receipt photo. Tuned against a real handwritten receipt (the
 * handwriting hints and the two "spelled" fields lifted plate, date and colour reads from wrong
 * to right). Keep scripts/eval-extraction.mjs handy when changing it. Today's date is passed in
 * so a handwritten 6 is not read as a 4 (2024 instead of 2026).
 */
export const extractionPrompt = (today: string = manilaToday()) => `You read a photo of a handwritten Philippine car-sale "Acknowledgement of Payment" form from Manila Auto Display (MAD).

Return ONLY a JSON object with exactly these keys:
{
  "receipt_no": "the printed red number after 'No.' at the top right",
  "receipt_date": "date at the top, as YYYY-MM-DD",
  "buyer_name": "'Received from'",
  "buyer_address": "'Postal address'",
  "contact_spelled": "the contact number read one digit at a time, like 0-9-1-7-1-2-3-4-5-6-7, BEFORE you decide buyer_contact",
  "buyer_contact": "'Contact no.', built from contact_spelled",
  "amount_words": "'The sum of PESOS', written in words, exactly as written",
  "amount": "the numeric amount after 'P' next to the words",
  "paper_payment_type": "earnest | partial | full",
  "make_type": "'Make/Type', e.g. 2021 Honda Civic",
  "plate_spelled": "the plate read one character at a time, like N-K-F-4-7-7-1, BEFORE you decide plate_no",
  "plate_no": "'Plate No.', built from plate_spelled",
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
- Ignore the preprinted header, footer remarks and signatures.

Reading handwriting (this matters most):
- Today is ${today}. Receipts are filled in recently, so the year is almost always ${today.slice(0, 4)} (or the previous year just after New Year). A handwritten 6 is often mistaken for a 4: if you read 2024 or 2023, look again at the last digit.
- Plate numbers in the Philippines are 3 letters followed by 3 or 4 digits (e.g. NKF4771, ABC123). Read each character one at a time. A handwritten 7 has a flat top bar and no closed loop; a 9 has a closed loop on top; a 1 is a single stroke. A star or mark left of the "Plate No." label is NOT part of the plate.
- Color is a car color word such as BLACK, WHITE, SILVER, GRAY, RED, BLUE, GREEN, YELLOW, ORANGE, BROWN, BEIGE, MAROON, GOLD. Count the letters and compare: BLACK has 5 letters with a tall "K" at the end; BLUE has 4.
- Contact numbers are Philippine mobile numbers: 11 digits starting with 09 (e.g. 09171234567). Read digit by digit and return exactly 11 digits if you can see them all.
- The money amounts must agree: Less payment = the amount just paid, and Agreed price minus Less payment = Balance. Use that only to double-check a number you can already see; never invent one.
- Words fields (amount_words, balance_words): copy only the words that are actually handwritten. Do not add or complete words such as "ONLY" or "PESOS" if they are not on the line.
- Names and addresses: copy the handwriting letter by letter. Prefer real Philippine names and places (for example SAN FERNANDO, KAPITOLYO, PASIG CITY, QUEZON CITY) over invented ones, but never change letters you can clearly see.- Money on the right side (Agreed Price, Less Payment, Balance): copy exactly what is written. NEVER calculate a number that is not written. If Less Payment is a sum such as "20,000 + 580,000", return the TOTAL (600000) as less_payment. If Balance is not a single number (for example it says "Mad: 0  Gdfi: 130,000" or names a bank or financing company), return null for balance and copy that text as written into balance_words; do not turn it into a number.
- paper_payment_type is the ONE option that has a line under it, a circle or a tick: earnest money, partial payment or full payment. Look for the underline carefully. If a word is struck through, it was NOT chosen.
- payment_method: only the box with an X or check mark counts ("Cash" or "Check"). A filled-in Bank/Br. line does NOT mean the payment was by check. check_no only if a check number is actually written, otherwise null.
- balance_due_date: only a real date, as YYYY-MM-DD. If it says something else (such as "Upon approval of financing", "0" or a dash), return null.
- Motor No. and Chassis No.: copy character by character; letters O and I are rare in these numbers, digits 0 and 1 are common. If you cannot read one, return null instead of guessing.
- Numeric dates are MONTH/DAY/YEAR: 11/03/2026 is November 3, 2026 (the first number is the month, 01 to 12). A date is never earlier than a few months before today's date given above, so reread it if it seems far off.
- Tick boxes are written like "( ) Check" and "(X) Cash" or "(√) Cash": the choice is the word whose brackets contain a tick, X or check mark; empty brackets "( )" mean not chosen. Decide Cash or Check by looking at BOTH brackets.
- Names: copy exactly the letters you see; do not replace a hard-to-read name with a more common one.`;

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
      { role: "system", content: extractionPrompt() },
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
