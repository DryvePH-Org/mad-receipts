import { manilaToday } from "@/lib/dates";
import { chatJson } from "./groq";
import { groundInTranscript } from "./grounding";
import { VoiceExtraction, type VoiceProposal } from "./schema";

/** A problem with the voice note that staff can act on; the message is safe to show them. */
export class VoiceError extends Error {}

/** Names the form already knows, so a spoken "G cash" or "BDO" is written the way the form spells it. */
export interface VoiceVocabulary { institutions: string[]; wallets: string[]; banks: string[]; colors: string[] }

export function voicePrompt(v: VoiceVocabulary): string {
  const list = (x: string[]) => (x.length ? x.join(", ") : "(none)");
  return `You read a transcript of a staff member at a Philippine car dealership (Manila Auto Display) saying, in English, Tagalog or a mix of both, the details of an "Acknowledgement of Payment" receipt for a car sale.

Return ONLY a JSON object with exactly these keys (null when not said; [] for an empty list):
{
  "receipt_no": "the booklet number", "date": "YYYY-MM-DD", "kind": "earnest | partial | full",
  "buyer_name": "...", "buyer_address": "...", "buyer_contact": "digits only",
  "units": [ { "make_type": "year make model, e.g. 2023 Toyota Vios", "plate": "ABC1234", "motor": "...", "chassis": "...", "color": "..." } ],
  "price": 0, "sale": "cash | financing", "institution": "...",
  "down_payment": 0, "down_payment_percent": 0, "loan_amount": 0, "monthly": 0, "years": 0,
  "fee_mode": "standard | none | percent | amount", "fee_value": 0,
  "trade_in": { "year": "...", "unit": "make and model", "plate": "...", "mileage": "...", "value": 0 },
  "lieu": { "amount": 0, "until": "YYYY-MM-DD" },
  "earlier_paid": 0, "cash_today": 0,
  "wallets": [ { "name": "GCash", "amount": 0, "ref": "reference number" } ],
  "check": { "amount": 0, "no": "...", "bank": "...", "branch": "..." },
  "due_date": "YYYY-MM-DD", "due_text": "words such as 'upon approval of the loan'", "remarks": "anything else worth writing down"
}

Rules:
- Put in a field only what was actually said. Anything not said is null. NEVER guess, calculate or invent a value. Do not work out a number that was not spoken (for example do not subtract the down payment from the price yourself).
- Spoken numbers become plain numbers: "fifty thousand" or "limampung libo" is 50000. "K" or "k" is thousand ("450K" is 450000), "mil" or "libo" is thousand, "milyon" is million ("kalahating milyon" is 500000), "isa't kalahati" is 1.5. "porsyento" and "percent" mean percent.
- price: "price", "agreed price", "presyo", "benta" is the agreed price of the car (all units together).
- sale: "cash" or "straight" is cash. "financing", "finance", "loan", "bank loan", "naka-loan", or a lender named (BDO, BPI, Security Bank...) is financing. A cash down payment on a financed car is still financing.
- institution is the lender's name; write it like these known names when it sounds like one: ${list(v.institutions)}.
- Financing: "down payment" or "DP" with an amount is down_payment. If the down payment is given as a percent ("20 percent down") use down_payment_percent and leave down_payment null. "loan" or "loan amount" or "financing amount" is loan_amount (what the lender pays). Only fill the ones that were said.
- Processing fee: "7 percent" or "standard PF" or "usual PF" is fee_mode "standard" only when the speaker says standard/usual/regular, or a plain "processing fee" with no number. "No PF", "zero PF", "walang processing fee" is "none". A percent that is not the standard ("5 percent PF") is "percent" with fee_value 5. A peso amount ("PF is 25 thousand") is "amount" with fee_value 25000.
- The word "cash" next to the price ("price 500K cash", "cash sale", "straight cash") only says HOW THE CAR IS PAID FOR: it sets sale to cash and is NOT money received. Money received today needs a word like paid, pays, binayad, nagbayad, received or "cash today".
- earlier_paid: money the buyer already paid BEFORE this receipt ("may bayad na", "already paid", "earnest 20K earlier"). cash_today: money paid in cash on THIS receipt ("pays 120K cash today", "binayad"). If an amount is paid today and no method is said, use cash_today.
- Other methods paid today: GCash, Maya, bank transfer, InstaPay and similar go in "wallets" with the name written like these known names when possible: ${list(v.wallets)}. A check goes in "check" (known banks: ${list(v.banks)}).
- kind: "earnest money" or "reservation" is earnest; "partial payment" or "down payment" is partial; "full payment" or "fully paid" is full.
- Trade-in ("trade in", "pa-trade", "palit"): trade_in with the traded car in unit (make and model), year, plate, mileage and value (what the traded car is worth).
- "In lieu of documents" or "OR/CR held as collateral": lieu with the amount and the date until.
- Phone numbers said digit by digit become one string of digits. Plate numbers said letter by letter ("N K F four seven seven one") become "NKF4771". Motor and chassis numbers the same way, letters and digits only.
- Colors: use the common spelling, e.g. ${list(v.colors.slice(0, 18))}.
- Dates are YYYY-MM-DD. If the year is not said, use the year of today's date. "Bukas" is tomorrow, "next Friday" is the coming Friday. due_date is when the balance will be given ("on or before", "bayaran sa"). If it is said as words instead of a date ("upon approval of the loan") use due_text.
- Names and places: write them as said, in normal capitalization. Do not complete or correct a name.`;
}

function parseJson(raw: string): unknown {
  try { return JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "")); } catch { return undefined; }
}

/** The extraction step, with the model call injectable so it can be tested without the network. */
export async function interpretTranscript(
  transcript: string,
  vocab: VoiceVocabulary,
  source: VoiceProposal["source"],
  unclear: string[] = [],
  call: (system: string, user: string) => Promise<string> = chatJson,
): Promise<VoiceProposal> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await call(voicePrompt(vocab), `Today is ${manilaToday()} (Manila time).\n\nTranscript:\n${transcript}`);
    const parsed = VoiceExtraction.safeParse(parseJson(raw));
    if (!parsed.success) continue;
    const { fields, unsure } = groundInTranscript(transcript, parsed.data);
    return { source, transcript, fields, unsure, unclear };
  }
  throw new VoiceError("I couldn't understand that recording. Try again, or type the details instead.");
}
