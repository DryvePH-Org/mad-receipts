import { describe, expect, it } from "vitest";
import { interpretTranscript } from "@/lib/voice/interpret";
import { DEFAULT_SETTINGS } from "@/lib/deal/settings";

// The real gpt-oss model reading sentences the way staff would say them. Run: npm run test:live
const vocab = { institutions: DEFAULT_SETTINGS.institutions, wallets: DEFAULT_SETTINGS.wallets, banks: DEFAULT_SETTINGS.banks, colors: DEFAULT_SETTINGS.colors.common.map(([c]) => c) };
const read = (t: string) => interpretTranscript(t, vocab, "typed");

describe("reading what staff say (real model)", () => {
  it("English, financing with a fee and an earlier payment", async () => {
    const p = await read("Buyer is Maria Santos, contact zero nine one seven one two three four five six seven, address 27 Maginhawa Street Quezon City. Unit is a 2023 Toyota Vios, plate N K F four seven seven one, color silver. Price is seven hundred twenty thousand, BDO financing, down payment one hundred fifty thousand, standard processing fee. She already paid twenty thousand earlier and pays one hundred twenty thousand cash today.");
    const f = p.fields;
    expect([f.buyer_name, f.buyer_contact, f.price, f.sale, f.institution, f.down_payment, f.earlier_paid, f.cash_today]).toEqual(["Maria Santos", "09171234567", 720000, "financing", "BDO", 150000, 20000, 120000]);
    expect(f.units[0]).toMatchObject({ plate: "NKF4771" });
    expect(f.units[0].make_type).toContain("Vios");
    expect(f.fee_mode).toBe("standard");
    expect(f.loan_amount).toBeNull(); // not said, so never worked out
    console.info(JSON.stringify(f), p.unsure);
  });

  it("Tagalog and K shorthand, percent down, a different fee, GCash", async () => {
    const p = await read("Kay Juan dela Cruz po, Mitsubishi Xpander, plate A B C one two three four, presyo 850K, naka-loan sa Security Bank, 20 porsyento ang down, five percent PF, nag-GCash siya ng limampung libo, reference number one two three four five.");
    const f = p.fields;
    expect([f.buyer_name, f.price, f.sale, f.institution, f.down_payment_percent, f.fee_mode, f.fee_value]).toEqual(["Juan dela Cruz", 850000, "financing", "Security Bank", 20, "percent", 5]);
    expect(f.wallets[0]).toMatchObject({ name: "GCash", amount: 50000 });
    console.info(JSON.stringify(f), p.unsure);
  });

  it("cash with a trade-in", async () => {
    const p = await read("Cash sale, price four hundred fifty thousand, trade in 2015 Honda City plate D A B 5 5 5 5 valued at one hundred twenty thousand, balance on or before December 15 2026.");
    const f = p.fields;
    expect([f.sale, f.price, f.trade_in?.value, f.due_date]).toEqual(["cash", 450000, 120000, "2026-12-15"]);
    expect(f.trade_in?.plate).toBe("DAB5555");
    console.info(JSON.stringify(f), p.unsure);
  });

  it("no processing fee, in lieu of documents, a check", async () => {
    const p = await read("Financing with GDFI, price six hundred thousand, loan amount four hundred eighty thousand, no PF. In lieu of documents twenty five thousand until November 30 2026. Paid by check number 0 0 1 2 3 4 from BPI, amount fifty thousand.");
    const f = p.fields;
    expect([f.price, f.loan_amount, f.fee_mode, f.lieu?.amount, f.check?.amount, f.check?.bank]).toEqual([600000, 480000, "none", 25000, 50000, "BPI"]);
    console.info(JSON.stringify(f), p.unsure);
  });

  it("never invents what was not said", async () => {
    const p = await read("Price is five hundred thousand cash, the buyer is Pedro.");
    const f = p.fields;
    expect([f.price, f.buyer_name, f.sale]).toEqual([500000, "Pedro", "cash"]);
    expect([f.buyer_contact, f.down_payment, f.loan_amount, f.cash_today, f.earlier_paid, f.fee_mode, f.trade_in, f.check]).toEqual([null, null, null, null, null, null, null, null]);
    expect(f.units).toEqual([]);
  });
});
