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

type Strip = (label: string) => void;
type Fields = VoiceExtraction;

export function groundInTranscript(transcript: string, data: Fields): { fields: Fields; unsure: string[] } {
  const text = normalizeName(transcript);
  const tokens = new Set(text.split(" ").filter(Boolean));
  const nums = numbersIn(transcript);
  const digitStrings = digitStringsIn(transcript);
  const compact = compactSpoken(transcript);
  const unsure: string[] = [];
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

  const f: Fields = structuredClone(data);
  const money$ = <K extends keyof Fields>(key: K, label: string) => { if (!money(f[key] as number | null)) { (f[key] as number | null) = null; drop(label); } };
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
  f.buyer_contact = code$(f.buyer_contact, "the contact number");
  if (f.date && !date(f.date)) { f.date = null; drop("the receipt date"); }
  if (f.kind && !KEYWORDS[f.kind].test(text)) { f.kind = null; drop("the payment type"); }

  f.units = f.units.map((u) => ({
    make_type: spokenOnly(u.make_type, "the make and model"), plate: code$(u.plate, "the plate number"), motor: code$(u.motor, "the motor number"),
    chassis: code$(u.chassis, "the chassis number"), color: color(u.color) ? u.color : (drop("the color"), null),
  })).filter((u) => Object.values(u).some(Boolean));

  money$("price", "the agreed price");
  if (f.sale === "cash" && !KEYWORDS.cash.test(text)) { f.sale = null; drop("how it is paid"); }
  if (f.sale === "financing" && !KEYWORDS.financing.test(text)) { f.sale = null; drop("how it is paid"); }
  f.institution = words$(f.institution, "the financing company");
  money$("down_payment", "the down payment");
  money$("down_payment_percent", "the down payment percent");
  money$("loan_amount", "the loan amount");
  money$("monthly", "the monthly payment");
  money$("years", "the years to pay");
  if (f.fee_mode === "none" && !KEYWORDS.none.test(text)) { f.fee_mode = null; drop("the processing fee"); }
  if (f.fee_mode && f.fee_mode !== "none" && f.fee_mode !== "standard" && !money(f.fee_value)) { f.fee_mode = null; f.fee_value = null; drop("the processing fee"); }
  if (f.fee_mode === "standard" && !/(processing|pf|fee|standard|usual)/.test(text)) { f.fee_mode = null; drop("the processing fee"); }
  if (f.fee_mode === "none" || f.fee_mode === "standard") f.fee_value = null;

  if (f.trade_in) {
    const t = f.trade_in;
    if (!money(t.value)) { t.value = null; drop("the trade-in value"); }
    t.unit = words$(t.unit, "the traded car");
    t.plate = code$(t.plate, "the trade-in plate");
    t.year = code$(t.year, "the trade-in year");
    t.mileage = code$(t.mileage, "the trade-in mileage");
    if (!t.value && !t.unit && !t.plate && !t.year && !t.mileage) f.trade_in = null;
  }
  if (f.lieu) {
    if (!money(f.lieu.amount)) { f.lieu.amount = null; drop("the in-lieu amount"); }
    if (f.lieu.until && !date(f.lieu.until)) { f.lieu.until = null; drop("the in-lieu date"); }
    if (!f.lieu.amount && !f.lieu.until) f.lieu = null;
  }
  money$("earlier_paid", "the amount paid before");
  money$("cash_today", "the cash paid today");
  // "price 500K cash" says how the car is paid for, not that money was received.
  if (f.cash_today !== null && !PAID_WORDS.test(text)) { f.cash_today = null; drop("the cash paid today"); }
  f.wallets = f.wallets.map((w) => {
    const amount = money(w.amount) ? w.amount : (drop("a wallet or bank amount"), null);
    return { name: words$(w.name, "the payment method"), amount, ref: code$(w.ref, "the reference number") };
  }).filter((w) => w.amount !== null || w.name);
  if (f.check) {
    const c = f.check;
    if (!money(c.amount)) { c.amount = null; drop("the check amount"); }
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
  return { fields: f, unsure };
}
