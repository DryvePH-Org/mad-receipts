import { normalizeName } from "@/lib/salespeople/names";
import { editDistance } from "@/lib/rules/words";
import { compactSpoken, digitStringsIn, numbersIn } from "./numbers";
import type { ExtractedReceipt } from "./schema";
import type { TermsSuggestion } from "./terms-schema";

/**
 * "Only what was really said goes through." The language model that reads a transcript can still
 * slip: invent a number, complete a name, turn a word into the wrong value. So every value it returns
 * is checked, in plain code, against the transcript itself. A value that cannot be found in what was
 * said is thrown away (left blank) and listed in `unsure`, so staff type it instead of trusting a guess.
 */

export interface HeardPerson {
  name: string;
  commission_percent: number | null;
}

export interface Grounded {
  fields: ExtractedReceipt;
  terms: TermsSuggestion;
  salespeople: HeardPerson[];
  /** Plain-language labels of what was dropped, e.g. ["the plate number", "the loan amount"]. */
  unsure: string[];
}

const FIELD_LABEL: Partial<Record<keyof ExtractedReceipt, string>> = {
  receipt_no: "the receipt number", receipt_date: "the receipt date", buyer_name: "the buyer's name",
  buyer_address: "the address", buyer_contact: "the contact number", amount: "the amount paid",
  paper_payment_type: "the payment type", make_type: "the make and model", plate_no: "the plate number",
  motor_no: "the motor number", chassis_no: "the chassis number", color: "the color", agreed_price: "the agreed price",
  less_payment: "the less payment", balance: "the balance", payment_method: "cash or check", check_no: "the check number",
  bank_branch: "the bank", balance_amount: "the balance amount", balance_due_date: "the due date",
};
const TERMS_LABEL: Record<keyof TermsSuggestion, string> = {
  transaction_type: "how it is paid", loan_amount: "the loan amount", processing_fee: "the processing fee",
  trade_in_value: "the trade-in value", trade_in_details: "the traded car", financier: "the financing company",
  paid_before: "the amount paid before",
};

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
const RELATIVE_DATE = /\b(today|ngayon|tomorrow|bukas|next|susunod|linggo|week|buwan|month|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunes|martes|miyerkules|huwebes|biyernes|sabado|araw)\b/;

const KEYWORDS = {
  cash: /\b(cash|straight|buo|tuwid)\b/,
  financing: /(financ|loan|bank|bangko|bpi|bdo|gdfi|rcbc|metrobank|security|unionbank|pnb|maybank|hulog|hulugan)/,
  trade_in: /(trade|tinrade|palit|pa-?trade)/,
  earnest: /(earnest|reserv|booking)/,
  partial: /(partial|hulog|installment|down)/,
  full: /\b(full|fully|buo|buong)\b/,
  check: /\b(check|cheque|tseke)\b/,
};

export function groundInTranscript(
  transcript: string,
  data: { fields: ExtractedReceipt; terms: TermsSuggestion; salespeople: HeardPerson[] },
): Grounded {
  const text = normalizeName(transcript);
  const tokens = new Set(text.split(" ").filter(Boolean));
  const nums = numbersIn(transcript);
  const digitStrings = digitStringsIn(transcript);
  const compact = compactSpoken(transcript);
  const unsure: string[] = [];
  const drop = (label: string | undefined) => {
    if (label && !unsure.includes(label)) unsure.push(label);
  };

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
  const color = (v: string | null): boolean => {
    if (!v) return true;
    const c = normalizeName(v);
    return words(v) || (COLORS[c] ?? []).some((t) => tokens.has(t));
  };
  const date = (v: string | null): boolean => {
    if (!v) return true;
    if (RELATIVE_DATE.test(text)) return true; // "tomorrow", "next Friday": the model worked out the date
    const [, month, day] = v.split("-").map(Number);
    const monthSaid = MONTHS[month - 1].some((m) => tokens.has(m)) || nums.has(month);
    return nums.has(day) && monthSaid;
  };

  const f = { ...data.fields };
  const strip = <K extends keyof ExtractedReceipt>(key: K) => {
    f[key] = null as ExtractedReceipt[K];
    drop(FIELD_LABEL[key]);
  };

  for (const key of ["amount", "agreed_price", "less_payment", "balance", "balance_amount"] as const) {
    if (!money(f[key])) strip(key);
  }
  for (const key of ["receipt_no", "motor_no", "chassis_no", "check_no", "plate_no", "buyer_contact"] as const) {
    if (!code(f[key])) strip(key);
  }
  for (const key of ["buyer_name", "buyer_address", "make_type", "bank_branch"] as const) {
    if (!words(f[key])) strip(key);
  }
  if (!color(f.color)) strip("color");
  for (const key of ["receipt_date", "balance_due_date"] as const) {
    if (!date(f[key])) strip(key);
  }
  if (f.paper_payment_type && !KEYWORDS[f.paper_payment_type].test(text)) strip("paper_payment_type");
  if (f.payment_method === "cash" && !KEYWORDS.cash.test(text)) strip("payment_method");
  if (f.payment_method === "check" && !KEYWORDS.check.test(text)) strip("payment_method");
  // The words on the paper cannot be said into a voice note.
  f.amount_words = null;
  f.balance_words = null;

  const t = { ...data.terms };
  const stripTerm = <K extends keyof TermsSuggestion>(key: K) => {
    t[key] = null as TermsSuggestion[K];
    drop(TERMS_LABEL[key]);
  };
  if (t.transaction_type && !KEYWORDS[t.transaction_type].test(text)) stripTerm("transaction_type");
  for (const key of ["loan_amount", "processing_fee", "trade_in_value", "paid_before"] as const) {
    if (!money(t[key])) stripTerm(key);
  }
  for (const key of ["financier", "trade_in_details"] as const) {
    if (!words(t[key])) stripTerm(key);
  }

  // The amounts decide the type when the words are mixed: "trade-in, the rest in cash" is a trade-in,
  // and a loan with cash for the down payment is financing.
  if (t.trade_in_value !== null) t.transaction_type = "trade_in";
  else if (t.loan_amount !== null) t.transaction_type = "financing";

  const salespeople: HeardPerson[] = [];
  for (const person of data.salespeople) {
    if (!words(person.name)) {
      drop("a salesperson's name");
      continue;
    }
    if (person.commission_percent !== null && !nums.has(person.commission_percent)) {
      drop(`${person.name}'s commission %`);
      salespeople.push({ ...person, commission_percent: null });
    } else {
      salespeople.push(person);
    }
  }

  return { fields: f, terms: t, salespeople, unsure };
}
