import { describe, expect, it } from "vitest";
import { groundInTranscript } from "@/lib/voice/grounding";
import { interpretTranscript } from "@/lib/voice/interpret";
import { VoiceExtraction } from "@/lib/voice/schema";

const ext = (over: Record<string, unknown>) => VoiceExtraction.parse(over);
const vocab = { institutions: ["BDO"], wallets: ["GCash"], banks: ["BDO"], colors: ["Silver"] };

describe("only what was really said goes through", () => {
  const said = "Buyer Maria Santos, contact zero nine one seven one two three four five six seven, Vios plate N K F four seven seven one, price seven hundred twenty thousand, BDO financing, down payment one hundred fifty thousand, paid one hundred twenty thousand cash today";
  it("keeps the real values", () => {
    const { fields, unsure } = groundInTranscript(said, ext({ buyer_name: "Maria Santos", buyer_contact: "09171234567", units: [{ make_type: "Toyota Vios", plate: "NKF4771" }], price: 720000, sale: "financing", institution: "BDO", down_payment: 150000, cash_today: 120000 }));
    expect(unsure).toEqual([]);
    expect([fields.buyer_name, fields.buyer_contact, fields.price, fields.down_payment, fields.cash_today]).toEqual(["Maria Santos", "09171234567", 720000, 150000, 120000]);
    expect(fields.units[0].plate).toBe("NKF4771");
  });
  it("throws away numbers, names and codes that are not in the words", () => {
    const { fields, unsure } = groundInTranscript(said, ext({ buyer_name: "Maria Santos Reyes", price: 750000, down_payment: 160000, loan_amount: 570000, units: [{ plate: "ABC1234", motor: "2NZ999" }], monthly: 14250 }));
    expect([fields.buyer_name, fields.price, fields.down_payment, fields.loan_amount, fields.monthly]).toEqual([null, null, null, null, null]);
    expect(fields.units).toEqual([]);
    expect(unsure).toEqual(expect.arrayContaining(["the buyer's name", "the agreed price", "the down payment", "the loan amount", "the plate number", "the monthly payment"]));
  });
  it("does not take 'cash' beside the price as money received", () => {
    const { fields, unsure } = groundInTranscript("Price is five hundred thousand cash, the buyer is Pedro.", ext({ price: 500000, sale: "cash", cash_today: 500000, buyer_name: "Pedro" }));
    expect([fields.cash_today, fields.price, fields.sale]).toEqual([null, 500000, "cash"]);
    expect(unsure).toContain("the cash paid today");
  });
  it("reads Tagalog and K shorthand", () => {
    const { fields } = groundInTranscript("presyo 850K, down singkwenta mil, nag-GCash siya ng limampung libo", ext({ price: 850000, down_payment: 50000, wallets: [{ name: "GCash", amount: 50000 }] }));
    expect([fields.price, fields.down_payment, fields.wallets[0]?.amount]).toEqual([850000, 50000, 50000]);
  });
  it("needs the words for no-fee, a standard fee and a loan", () => {
    expect(groundInTranscript("price 600 thousand BDO loan 480 thousand", ext({ fee_mode: "none" })).fields.fee_mode).toBeNull();
    expect(groundInTranscript("price 600 thousand BDO loan 480 thousand, no PF", ext({ fee_mode: "none" })).fields.fee_mode).toBe("none");
    expect(groundInTranscript("seven percent processing fee, the usual", ext({ fee_mode: "standard" })).fields.fee_mode).toBe("standard");
    expect(groundInTranscript("five percent PF", ext({ fee_mode: "percent", fee_value: 5 })).fields.fee_value).toBe(5);
    expect(groundInTranscript("five percent PF", ext({ fee_mode: "percent", fee_value: 6 })).fields.fee_mode).toBeNull();
  });
  it("checks dates against the words, but trusts 'tomorrow'", () => {
    expect(groundInTranscript("balance on or before December 15", ext({ due_date: "2026-12-15" })).fields.due_date).toBe("2026-12-15");
    expect(groundInTranscript("balance on or before December 15", ext({ due_date: "2026-12-20" })).fields.due_date).toBeNull();
    expect(groundInTranscript("balance tomorrow", ext({ due_date: "2026-11-06" })).fields.due_date).toBe("2026-11-06");
  });
});

describe("reading the model's answer", () => {
  it("accepts text numbers, drops junk, and retries once on bad JSON", async () => {
    let calls = 0;
    const p = await interpretTranscript("price five hundred thousand, buyer Pedro", vocab, "typed", [], async () => {
      calls++;
      return calls === 1 ? "not json" : '```json\n{"price":"500,000","buyer_name":"Pedro","kind":"nonsense","units":"x"}\n```';
    });
    expect(calls).toBe(2);
    expect([p.fields.price, p.fields.buyer_name, p.fields.kind, p.fields.units]).toEqual([500000, "Pedro", null, []]);
  });
  it("gives up with a message staff can act on", async () => {
    await expect(interpretTranscript("x", vocab, "typed", [], async () => "nope")).rejects.toThrow(/type the details/);
  });
});
