import "server-only";
import { matchSalesperson, transcriptionPrompt, type SalespersonRef } from "@/lib/salespeople/names";
import { callGroqJson, callGroqTranscription } from "./groq";
import { VoiceExtraction, type HeardSalesperson, type VoiceResult } from "./voice-schema";

/** A problem with the voice note that staff can act on; the message is safe to show them. */
export class VoiceError extends Error {}

const MAX_TRANSCRIPT_CHARS = 4000;

const FIELD_KEYS = `receipt_no, receipt_date, buyer_name, buyer_address, buyer_contact, amount_words, amount, paper_payment_type (earnest | partial | full), make_type, plate_no, motor_no, chassis_no, color, agreed_price, less_payment, balance, payment_method (cash | check), check_no, bank_branch, balance_words, balance_amount, balance_due_date`;

export function voicePrompt(people: SalespersonRef[]): string {
  const names = people.map((p) => (p.aliases.length ? `${p.name} (${p.aliases.join(", ")})` : p.name)).join("; ");
  return `You read a transcript of a staff member at a Philippine car dealership (Manila Auto Display) saying, in English, Tagalog or a mix of both, the details of an "Acknowledgement of Payment" receipt and who sold the car.

Return ONLY a JSON object:
{
  "fields": { ${FIELD_KEYS} },
  "terms": { "transaction_type": "cash | financing | trade_in", "loan_amount": 0, "financier": "...", "processing_fee": 0, "trade_in_value": 0, "trade_in_details": "...", "paid_before": 0 },
  "salespeople": [ { "name": "...", "commission_percent": 3 } ]
}

Rules:
- Put in "fields" only what was actually said. Anything not said is null. NEVER guess or invent a value.
- Spoken numbers become digits without commas or symbols: "fifty thousand" or "limampung libo" is 50000. Understand Tagalog and shorthand: "K" or "k" is thousand ("450K" is 450000), "mil" or "libo" is thousand ("singkwenta mil" is 50000), "milyon" is million ("kalahating milyon" is 500000, "isang milyon" is 1000000), "isa't kalahati" is 1.5, "dalawa't kalahati" is 2.5, "porsyento" means percent.
- What each thing means: "amount", "binayad", "paid", "down", "down payment", "earnest", "reservation fee" is the money paid on this receipt (amount). "price", "agreed price", "presyo", "benta" is the agreed price of the car. "balance", "remaining", "natitira", "kulang" is what is still owed (balance). "due", "on or before", "bayaran sa" is balance_due_date. "buyer", "customer", "received from", "kay" before a customer name is buyer_name.
- Phone numbers spoken digit by digit become one string of digits: "zero nine one seven, three two one, six zero seven eight" is "09173216078".
- Plate numbers spoken letter by letter ("N K F four seven seven one") become "NKF4771".
- Dates are YYYY-MM-DD. If the year is not said, use the year of today's date.
- "salespeople" lists everyone credited with selling the car (the salesman and any others involved), each with their OWN commission percent as a number ("three percent" is 3, "two point five" is 2.5). If no percent was said for a person, use null. If nobody is named, use [].
- Write each salesperson's name as said. If it sounds like one of these known salespeople, use that exact spelling: ${names || "(none yet)"}.
- Commission percents belong in "salespeople", never in "fields".
- "terms" says how the sale is paid; every part is null unless it was said:
  - "cash" or "straight payment" means transaction_type "cash".
  - "financing", "finance", "loan", "bank loan" or "naka-loan" means "financing". loan_amount is the amount the bank or financing company pays ("loan amount", "financing amount", "loan ng bangko"). financier is the company's name (BPI, GDFI, Security Bank). processing_fee is the processing fee the buyer pays.
  - "trade in", "trade-in" or "pa-trade" means "trade_in". trade_in_value is what the traded car is worth ("value ng trade in") and trade_in_details describes that car ("2015 Vios").
  - paid_before is money the buyer already paid before this receipt ("may bayad na ng 20K", "already paid 20 thousand before").
  - The money paid on THIS receipt ("down payment", "binayad", "paid") belongs in fields.amount, never in terms. A "down payment" is not the loan.
  - A price, loan, fee or value that is not said stays null.`;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ""));
  } catch {
    return undefined;
  }
}

/** Today in Manila as YYYY-MM-DD. */
const manilaToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila" }).format(new Date());

/** Speech to text. Names from the salespeople list are given to the model as hints. */
export async function transcribeVoice(bytes: Uint8Array, mimeType: string, people: SalespersonRef[]): Promise<string> {
  const text = (await callGroqTranscription(bytes, mimeType, transcriptionPrompt(people))).trim();
  if (!text) throw new VoiceError("I couldn't hear anything in that recording. Please try again, closer to the phone.");
  return text.slice(0, MAX_TRANSCRIPT_CHARS);
}

/** Turns what was said (or typed) into receipt fields and salespeople matched to the list. */
export async function interpretTranscript(
  transcript: string,
  people: SalespersonRef[],
  source: VoiceResult["source"],
): Promise<VoiceResult> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await callGroqJson(voicePrompt(people), `Today is ${manilaToday()} (Manila time).\n\nTranscript:\n${transcript}`);
    const parsed = VoiceExtraction.safeParse(parseJson(raw));
    if (!parsed.success) continue;

    const salespeople: HeardSalesperson[] = parsed.data.salespeople.map((heard) => ({
      ...matchSalesperson(heard.name, people),
      spoken: heard.name,
      commission_percent: heard.commission_percent,
    }));
    return { source, transcript, fields: parsed.data.fields, terms: parsed.data.terms, salespeople, transcribed_at: new Date().toISOString() };
  }
  throw new VoiceError("I couldn't understand that recording. Try again, or type the details instead.");
}
