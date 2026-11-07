import { editDistance } from "@/lib/rules/words";
import { compactSpoken, digitStringsIn, numbersIn } from "./numbers";
import type { VoiceExtraction } from "./schema";
import { normalizeName } from "./text";

/**
 * "Only what was really said goes through." The language model that reads a transcript can still
 * slip: invent a number, complete a name, turn a word into the wrong value. So every value it returns
 * is checked, in plain code, against the transcript itself. A value that cannot be found in what was
 * said is thrown away (left blank) and listed in `unsure`, so staff type it instead of trusting a guess.
 */

const COLORS: Record<string, string[]> = {
  black: ["itim", "negro"], white: ["puti", "blanco"], red: ["pula", "pulang", "rojo"], blue: ["asul", "bughaw", "azul"],
  green: ["berde", "luntian"], yellow: ["dilaw"], gray: ["abo", "grey", "gris"], silver: ["pilak", "plata"],
  brown: ["kayumanggi", "kape", "kayumangging"], orange: ["kahel", "dalandan"], maroon: ["marron"],
};
const MONTHS = [
  ["january", "jan", "enero"], ["february", "feb", "pebrero"], ["march", "mar", "marso"], ["april", "apr", "abril"],
  ["may", "mayo"], ["june", "jun", "hunyo"], ["july", "jul", "hulyo"], ["august", "aug", "agosto"],
  ["september", "sep", "sept", "setyembre"], ["october", "oct", "oktubre"], ["november", "nov", "nobyembre"], ["december", "dec", "disyembre"],
];
const RELATIVE_DATE = /\b(today|ngayon|tomorrow|bukas|next|susunod|linggo|week|buwan|month|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunes|martes|miyerkules|huwebes|biyernes|sabado|araw|end|katapusan|kinsenas)\b/;
const KEYWORDS = {
  cash: /\b(cash|straight|buo|tuwid)\b/,
  financing: /(financ|loan|bank|bangko|hulog|hulugan|dp|down|bpi|bdo|gdfi|rcbc|metrobank|security|unionbank|pnb|maybank)/,
  earnest: /(earnest|reserv|booking)/,
  partial: /(partial|hulog|installment|down|dp)/,
  full: /\b(full|fully|buo|buong|buo ang)\b/,
  none: /(no (processing )?fee|zero (pf|fee)|walang (pf|processing)|zero pf|0 pf|no pf|libre)/,
};

const PAID_WORDS = /(paid|pay|pays|payment|binayad|nagbayad|bayad|received|receive|handed|nag cash|nagcash|cash today|ngayon|down|earnest|dp|reservation|deposit)/;


const ROLE = {
  price: /(price|presyo|benta|agreed|total|worth|halaga|sold|bili|cost|srp)/,
  down: /(down|dp|initial|hulog|first|upfront)/,
  loan: /(loan|financ|bank|utang|lender|approved|release|amount)/,
  monthly: /(month|monthly|buwan|amort|hulog)/,
  years: /(year|taon|yr|term|\b\d+ ?y\b)/,
  fee: /(fee|pf|processing)/,
  trade: /(trade|value|worth|halaga|palit|tinrade)/,
  lieu: /(lieu|collateral|document|docs|or cr|orcr|hawak|hold)/,
  earlier: /(earlier|before|already|advance|nauna|dati|bayad|na ang|na yung|previous|paid|reserv|earnest|deposit)/,
  check: /(check|cheque|tseke)/,
  any: /./,
};

const key2 = (v: string | null) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

type Strip = (label: string) => void;
type Fields = VoiceExtraction;

export function groundInTranscript(transcript: string, data: Fields): { fields: Fields; unsure: string[]; conflicts: string[] } {
  const text = normalizeName(transcript);
  const tokens = new Set(text.split(" ").filter(Boolean));
  const nums = numbersIn(transcript);
  const digitStrings = digitStringsIn(transcript);
  const compact = compactSpoken(transcript);
  const unsure: string[] = [], conflicts: string[] = [];
  const drop: Strip = (label) => { if (!unsure.includes(label)) unsure.push(label); };

  const money = (v: number | null): boolean => v === null || nums.has(v) || nums.has(Math.round(v * 100) / 100);
  const code = (v: string | null): boolean => {
    if (!v) return true;
    const c = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return c === "" || compact.includes(c) || (/^\d+$/.test(c) && digitStrings.has(c));
  };
  const word = (w: string): boolean => {
    if (w.length <= 2) return true; // initials like "B."
    if (/^\d+$/.test(w)) return nums.has(Number(w)) || digitStrings.has(w) || compact.includes(w);
    if (tokens.has(w)) return true;
    return w.length >= 5 && [...tokens].some((t) => Math.abs(t.length - w.length) <= 1 && editDistance(t, w) <= 1);
  };
  const words = (v: string | null): boolean => !v || normalizeName(v).split(" ").filter(Boolean).every(word);
  const color = (v: string | null): boolean => !v || words(v) || (COLORS[normalizeName(v)] ?? []).some((t) => tokens.has(t));
  const date = (v: string | null): boolean => {
    if (!v) return true;
    if (RELATIVE_DATE.test(text)) return true; // "tomorrow", "next Friday": the model worked out the date
    const [, month, day] = v.split("-").map(Number);
    return nums.has(day) && (MONTHS[month - 1].some((m) => tokens.has(m)) || nums.has(month));
  };


  // ---- the model's own evidence: the exact words each value came from ----
  const quotes = new Map<string, string>();
  for (const q of data.quotes) if (q.field && q.quote) quotes.set(q.field.trim().toLowerCase(), q.quote);
  /** The quote is really in the transcript (allowing for small differences in how it was copied). */
  const quoteReal = (quote: string): boolean => {
    const n = normalizeName(quote);
    if (!n) return false;
    if (text.includes(n)) return true;
    const parts = n.split(" ");
    return parts.filter((w) => tokens.has(w)).length / parts.length >= 0.8;
  };
  /** A money value is right only if it is among the numbers in its own quote, and the quote talks about the right thing. */
  const moneyAt = (field: string, value: number | null, role: RegExp): boolean => {
    if (value === null) return true;
    if (!money(value)) return false;
    const quote = quotes.get(field);
    if (!quote) return true; // no evidence given: the check against the whole transcript above stands
    if (!quoteReal(quote)) return false;
    const inQuote = numbersIn(quote);
    // The word that says what the amount is may sit just before the quoted words ("presyo po, ano, three hundred fifty thousand").
    const n = normalizeName(quote), at = text.indexOf(n);
    const around = at >= 0 ? text.slice(Math.max(0, at - 60), at + n.length) : n;
    return (inQuote.has(value) || inQuote.has(Math.round(value * 100) / 100)) && role.test(around);
  };
  const codeAt = (field: string, value: string | null): boolean => {
    if (!value) return true;
    if (!code(value)) return false;
    const quote = quotes.get(field);
    if (!quote) return true;
    if (!quoteReal(quote)) return false;
    const c = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return compactSpoken(quote).includes(c) || (/^\d+$/.test(c) && digitStringsIn(quote).has(c));
  };

  const f: Fields = structuredClone(data);
  const code$ = (value: string | null, label: string): string | null => (code(value) ? value : (drop(label), null));
  const words$ = (value: string | null, label: string): string | null => (words(value) ? value : (drop(label), null));
  /** Only the words that were really said: "2023 Toyota Vios" after "Vios" becomes "Vios" (the model added the brand and year). */
  const spokenOnly = (value: string | null, label: string): string | null => {
    if (!value) return null;
    const said = value.split(/\s+/).filter((w) => word(normalizeName(w) || w) && normalizeName(w).length > 0);
    const real = said.filter((w) => normalizeName(w).length > 2);
    if (!real.length) { drop(label); return null; }
    return said.join(" ");
  };

  f.receipt_no = code$(f.receipt_no, "the receipt number");
  f.buyer_name = words$(f.buyer_name, "the buyer's name");
  f.buyer_address = words$(f.buyer_address, "the address");
  f.buyer_contact = codeAt("buyer_contact", f.buyer_contact) ? f.buyer_contact : (drop("the contact number"), null);
  if (f.date && !date(f.date)) { f.date = null; drop("the receipt date"); }
  if (f.kind && !KEYWORDS[f.kind].test(text)) { f.kind = null; drop("the payment type"); }

  f.units = f.units.map((u, i) => ({
    make_type: spokenOnly(u.make_type, "the make and model"),
    plate: codeAt(`plate:${i}`, u.plate) ? u.plate : (drop("the plate number"), null),
    color: color(u.color) ? u.color : (drop("the color"), null),
  })).filter((u) => Object.values(u).some(Boolean));
  // Saying the same car twice ("Vios NKF4771 ... again, the Vios NKF4771") is one car.
  const seen = new Set<string>();
  f.units = f.units.filter((u) => {
    const k = u.plate ? compactSpoken(u.plate) : JSON.stringify(u);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (!moneyAt("price", f.price, ROLE.price)) { f.price = null; drop("the agreed price"); }
  if (f.sale === "cash" && !KEYWORDS.cash.test(text)) { f.sale = null; drop("how it is paid"); }
  if (f.sale === "financing" && !KEYWORDS.financing.test(text)) { f.sale = null; drop("how it is paid"); }
  f.institution = words$(f.institution, "the financing company");
  if (!moneyAt("down_payment", f.down_payment, ROLE.down)) { f.down_payment = null; drop("the down payment"); }
  if (!moneyAt("down_payment_percent", f.down_payment_percent, ROLE.down)) { f.down_payment_percent = null; drop("the down payment percent"); }
  if (!moneyAt("loan_amount", f.loan_amount, ROLE.loan)) { f.loan_amount = null; drop("the loan amount"); }
  if (!moneyAt("monthly", f.monthly, ROLE.monthly)) { f.monthly = null; drop("the monthly payment"); }
  if (!moneyAt("years", f.years, ROLE.years)) { f.years = null; drop("the years to pay"); }
  if (f.fee_mode === "none" && !KEYWORDS.none.test(text)) { f.fee_mode = null; drop("the processing fee"); }
  if (f.fee_mode && f.fee_mode !== "none" && f.fee_mode !== "standard" && !moneyAt("fee_value", f.fee_value, ROLE.fee)) { f.fee_mode = null; f.fee_value = null; drop("the processing fee"); }
  if (f.fee_mode === "standard" && !/(processing|pf|fee|standard|usual)/.test(text)) { f.fee_mode = null; drop("the processing fee"); }
  if (f.fee_mode === "none" || f.fee_mode === "standard") f.fee_value = null;

  if (f.trade_in) {
    const t = f.trade_in;
    if (!moneyAt("trade_in_value", t.value, ROLE.trade)) { t.value = null; drop("the trade-in value"); }
    t.unit = words$(t.unit, "the traded car");
    t.plate = code$(t.plate, "the trade-in plate");
    t.year = code$(t.year, "the trade-in year");
    t.mileage = code$(t.mileage, "the trade-in mileage");
    if (!t.value && !t.unit && !t.plate && !t.year && !t.mileage) f.trade_in = null;
  }
  if (f.lieu) {
    if (!moneyAt("lieu_amount", f.lieu.amount, ROLE.lieu)) { f.lieu.amount = null; drop("the in-lieu amount"); }
    if (f.lieu.until && !date(f.lieu.until)) { f.lieu.until = null; drop("the in-lieu date"); }
    if (!f.lieu.amount && !f.lieu.until) f.lieu = null;
  }
  if (!moneyAt("earlier_paid", f.earlier_paid, ROLE.earlier)) { f.earlier_paid = null; drop("the amount paid before"); }
  if (!moneyAt("cash_today", f.cash_today, ROLE.any)) { f.cash_today = null; drop("the cash paid today"); }
  // "price 500K cash" says how the car is paid for, not that money was received.
  if (f.cash_today !== null && !PAID_WORDS.test(text)) { f.cash_today = null; drop("the cash paid today"); }
  f.wallets = f.wallets.map((w, i) => {
    const amount = moneyAt(`wallet:${i}`, w.amount, ROLE.any) ? w.amount : (drop("a wallet or bank amount"), null);
    return { name: words$(w.name, "the payment method"), amount, ref: code$(w.ref, "the reference number") };
  }).filter((w) => w.amount !== null || w.name);
  // The same payment said twice is one payment.
  f.wallets = f.wallets.filter((w, i, all) => all.findIndex((x) => key2(x.name) === key2(w.name) && x.amount === w.amount) === i);
  if (f.check) {
    const c = f.check;
    if (!moneyAt("check_amount", c.amount, ROLE.check)) { c.amount = null; drop("the check amount"); }
    c.no = code$(c.no, "the check number");
    c.bank = words$(c.bank, "the check's bank");
    c.branch = words$(c.branch, "the bank branch");
    if (!c.amount && !c.no && !c.bank) f.check = null;
  }
  if (f.due_date && !date(f.due_date)) { f.due_date = null; drop("the due date"); }
  f.due_text = words$(f.due_text, "the due date wording");
  f.remarks = words$(f.remarks, "the remarks");

  // A plate or percent said in the words can also decide the sale: a loan or a down payment means financing.
  if (!f.sale && (f.loan_amount !== null || f.institution)) f.sale = "financing";

  // ---- do the numbers agree with each other? ----
  const peso = (n: number) => `₱${n.toLocaleString("en-US")}`;
  if (f.price !== null && f.down_payment !== null && f.down_payment > f.price) {
    conflicts.push(`The down payment ${peso(f.down_payment)} is more than the price ${peso(f.price)}, so I left the down payment blank.`);
    f.down_payment = null;
  }
  if (f.down_payment_percent !== null && f.down_payment_percent > 100) {
    conflicts.push(`A down payment of ${f.down_payment_percent}% cannot be right, so I left it blank.`);
    f.down_payment_percent = null;
  }
  if (f.price !== null && f.down_payment !== null && f.loan_amount !== null && Math.round((f.down_payment + f.loan_amount) * 100) !== Math.round(f.price * 100)) {
    conflicts.push(`The down payment ${peso(f.down_payment)} and the loan ${peso(f.loan_amount)} do not add up to the price ${peso(f.price)}. I used the down payment and left the loan to be worked out.`);
    f.loan_amount = null;
  }
  if (f.years !== null && (f.years < 0.5 || f.years > 30)) { conflicts.push(`${f.years} years to pay does not look right, so I left it blank.`); f.years = null; }
  if (f.fee_mode === "percent" && f.fee_value !== null && f.fee_value > 25) conflicts.push(`A processing fee of ${f.fee_value}% is unusually high. Check it.`);
  if (f.price !== null && (f.price < 30000 || f.price > 20_000_000)) conflicts.push(`The price ${peso(f.price)} looks unusual for a car. Check it.`);
  if (f.buyer_contact && f.buyer_contact.replace(/\D/g, "").length !== 11) conflicts.push(`The contact number has ${f.buyer_contact.replace(/\D/g, "").length} digits, not 11. Check it.`);
  if (/\b(sorry|i mean|scratch that|correction|no wait|ay mali|mali pala|hindi pala|ibig kong sabihin|ay hindi|este)\b/.test(text)) {
    conflicts.push("You corrected yourself while speaking. I used the last thing you said, so check the amounts and names you changed.");
  }
  return { fields: f, unsure, conflicts };
}
