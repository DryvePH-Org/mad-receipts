import { describe, expect, it } from "vitest";
import { interpretTranscript } from "@/lib/extraction/voice";
import type { SalespersonRef } from "@/lib/salespeople/names";

// What the voice note understands, checked with realistic English, Tagalog and mixed sentences.
const people: SalespersonRef[] = [
  { id: "1", name: "David", aliases: ["Dave"] },
  { id: "2", name: "Ella", aliases: ["Ellah"] },
  { id: "3", name: "Sweet", aliases: [] },
];

interface Case {
  say: string;
  fields?: Record<string, unknown>;
  terms?: Record<string, unknown>;
  /** A part of terms.trade_in_details or financier that must appear (case-insensitive). */
  contains?: Record<string, string>;
  sales?: [string, number | null][];
}

const cases: Case[] = [
  {
    say: "Receipt number 2556, plate NKF 4771, fifty thousand pesos earnest money. Salesman David, three percent. Other salesman Ella, one point five percent.",
    fields: { receipt_no: "2556", plate_no: "NKF4771", amount: 50000, paper_payment_type: "earnest" },
    sales: [["David", 3], ["Ella", 1.5]],
  },
  {
    say: "Si David ang nagbenta, tatlong porsyento. Si Ella, isa't kalahating porsyento. Plate number NKF 4771, limampung libo ang binayad, earnest money.",
    fields: { plate_no: "NKF4771", amount: 50000, paper_payment_type: "earnest" },
    sales: [["David", 3], ["Ella", 1.5]],
  },
  {
    say: "Sweet sold it, two percent. Full payment of four hundred fifty thousand, plate ABC 1234, paid by check.",
    fields: { plate_no: "ABC1234", amount: 450000, paper_payment_type: "full", payment_method: "check" },
    sales: [["Sweet", 2]],
  },
  { say: "Salesman David.", sales: [["David", null]] },
  {
    say: "Balance is four hundred fifty K, due November 5.",
    fields: { balance: 450000, balance_due_date: "2026-11-05" },
    sales: [],
  },
  { say: "Dave and Ellah, three and two percent.", sales: [["David", 3], ["Ella", 2]] },
  { say: "Plate NKF 4771, amount twenty five thousand, cash.", fields: { plate_no: "NKF4771", amount: 25000, payment_method: "cash" }, sales: [] },
  { say: "Kalahating milyon ang presyo ng sasakyan, singkwenta mil ang down.", fields: { agreed_price: 500000, amount: 50000 } },
  {
    say: "Ang buyer ay si Maria Santos, contact zero nine one seven, three two one, six zero seven eight.",
    fields: { buyer_name: "Maria Santos", buyer_contact: "09173216078" },
  },
  {
    say: "Financing, price seven hundred twenty thousand. Loan amount one hundred thirty thousand with GDFI, processing fee ten thousand. Already paid twenty thousand before.",
    fields: { agreed_price: 720000 },
    terms: { transaction_type: "financing", loan_amount: 130000, processing_fee: 10000, paid_before: 20000 },
    contains: { financier: "gdfi" },
  },
  {
    say: "Naka-loan sa BPI, isang daang libo ang loan. Down payment limampung libo ang binayad ngayon.",
    fields: { amount: 50000 },
    terms: { transaction_type: "financing", loan_amount: 100000 },
    contains: { financier: "bpi" },
  },
  {
    say: "Trade in ito, 2015 Toyota Vios na silver, value two hundred thousand, tapos cash fifty thousand ang binayad.",
    fields: { amount: 50000 },
    terms: { transaction_type: "trade_in", trade_in_value: 200000 },
    contains: { trade_in_details: "vios" },
  },
  { say: "Straight payment, cash, fifty thousand.", fields: { amount: 50000 }, terms: { transaction_type: "cash", loan_amount: null, trade_in_value: null } },
  { say: "Plate NKF 4771, amount twenty thousand.", terms: { transaction_type: null, loan_amount: null, trade_in_value: null, paid_before: null } },
];

describe("voice note understanding (real Groq)", () => {
  for (const [index, c] of cases.entries()) {
    it(`#${index + 1}: ${c.say.slice(0, 60)}…`, async () => {
      if (index) await new Promise((r) => setTimeout(r, 4000)); // stay under the free-tier rate limit
      const result = await interpretTranscript(c.say, people, "typed");
      for (const [key, want] of Object.entries(c.fields ?? {})) {
        expect(result.fields[key as keyof typeof result.fields], key).toBe(want);
      }
      for (const [key, want] of Object.entries(c.terms ?? {})) {
        expect(result.terms?.[key as keyof NonNullable<typeof result.terms>], `terms.${key}`).toBe(want);
      }
      for (const [key, part] of Object.entries(c.contains ?? {})) {
        expect(String(result.terms?.[key as keyof NonNullable<typeof result.terms>] ?? "").toLowerCase(), `terms.${key}`).toContain(part);
      }
      if (c.sales) {
        const got = result.salespeople.map((s) => [people.find((p) => p.id === s.salespersonId)?.name ?? s.spoken, s.commission_percent]);
        expect(got).toEqual(c.sales);
      }
    });
  }
});
