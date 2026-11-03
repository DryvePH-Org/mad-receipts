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
];

describe("voice note understanding (real Groq)", () => {
  for (const [index, c] of cases.entries()) {
    it(`#${index + 1}: ${c.say.slice(0, 60)}…`, async () => {
      if (index) await new Promise((r) => setTimeout(r, 8000)); // stay under the free-tier rate limit
      const result = await interpretTranscript(c.say, people, "typed");
      for (const [key, want] of Object.entries(c.fields ?? {})) {
        expect(result.fields[key as keyof typeof result.fields], key).toBe(want);
      }
      if (c.sales) {
        const got = result.salespeople.map((s) => [people.find((p) => p.id === s.salespersonId)?.name ?? s.spoken, s.commission_percent]);
        expect(got).toEqual(c.sales);
      }
    });
  }
});
