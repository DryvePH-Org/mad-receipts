import { describe, expect, it } from "vitest";
import { applyVoice } from "@/app/(app)/new/voice-apply";
import { emptyFin, emptyForm, resolveFinance } from "@/app/(app)/new/form-state";
import { totalsFromForm } from "@/lib/deal/math";
import { DEFAULT_SETTINGS } from "@/lib/deal/settings";
import { VoiceExtraction } from "@/lib/voice/schema";

const settings = DEFAULT_SETTINGS, today = "2026-11-05";
const inventory = [
  { plate: "NKF 4771", makeType: "2023 Toyota Vios 1.3 XLE CVT", color: "Silver Metallic", status: "Available" as const },
  { plate: "ABC 1234", makeType: "2022 Mitsubishi Xpander GLS", color: "White Diamond", status: "Available" as const },
  { plate: "ABC 5678", makeType: "2022 Mitsubishi Xpander GLS", color: "Black", status: "Available" as const },
];
const v = (o: Record<string, unknown>) => VoiceExtraction.parse(o);
const run = (o: Record<string, unknown>, form = emptyForm(settings, today), fin = emptyFin(), extra: { linked?: boolean; overwrite?: boolean } = {}) =>
  applyVoice(form, fin, v(o), { settings, inventory, linked: false, today, ...extra });
/** The money, as the form works it out after the voice filled it. */
const money = (r: ReturnType<typeof run>) => {
  const dp = resolveFinance(r.form.price, r.fin);
  return totalsFromForm({ ...r.form, dp: r.form.sale === "financing" ? dp.dp : "", fee: r.form.sale === "financing" ? dp.fee : "" });
};

describe("filling the form from what was heard", () => {
  it("a financed sale: the standard fee, an earlier payment and cash today give the right balance", () => {
    const r = run({ buyer_name: "Maria Santos", price: 720000, sale: "financing", institution: "bdo", down_payment: 150000, fee_mode: "standard", earlier_paid: 20000, cash_today: 120000 });
    expect([r.form.receivedFrom, r.form.sale, r.form.institution, r.form.price, r.form.earlier, r.form.cash]).toEqual(["Maria Santos", "financing", "BDO", "720,000", "20,000", "120,000"]);
    const t = money(r);
    expect([t.dp, t.loan, t.fee, t.due, t.paid, t.balance]).toEqual([15000000, 57000000, 3990000, 18990000, 14000000, 4990000]); // 49,900 left
  });
  it("a down payment said as a percent, or as the loan, is worked out", () => {
    const pct = money(run({ price: 800000, sale: "financing", down_payment_percent: 20, fee_mode: "none", cash_today: 1 }));
    expect([pct.dp, pct.loan, pct.fee]).toEqual([16000000, 64000000, 0]);
    const loan = money(run({ price: 800000, sale: "financing", loan_amount: 600000, fee_mode: "percent", fee_value: 5 }));
    expect([loan.dp, loan.loan, loan.fee]).toEqual([20000000, 60000000, 3000000]);
    const amount = money(run({ price: 800000, sale: "financing", down_payment: 200000, fee_mode: "amount", fee_value: 25000 }));
    expect(amount.fee).toBe(2500000);
  });
  it("a financed sale with no fee said gets the usual fee, and 'no fee' really is no fee", () => {
    expect(money(run({ price: 720000, sale: "financing", down_payment: 150000 })).fee).toBe(3990000);
    expect(money(run({ price: 720000, sale: "financing", down_payment: 150000, fee_mode: "none" })).fee).toBe(0);
  });
  it("a plate in the inventory brings its make, type and color", () => {
    const r = run({ units: [{ plate: "NKF4771" }] });
    expect(r.form.units[0]).toMatchObject({ plate: "NKF 4771", makeType: "2023 Toyota Vios 1.3 XLE CVT", color: "Silver Metallic" });
  });
  it("a plate that is a different car in the inventory is not swapped quietly", () => {
    const r = run({ units: [{ make_type: "Toyota Vios", plate: "ABC1234" }] });
    expect([r.form.units[0].makeType, r.form.units[0].plate]).toEqual(["2023 Toyota Vios 1.3 XLE CVT", "ABC1234"]); // the make is matched by its words; the plate stays as said
    expect(r.notes[0]).toContain("listed in the inventory as 2022 Mitsubishi Xpander GLS");
  });
  it("a spoken make that matches one inventory type is written as the inventory spells it; two units fill two cards", () => {
    const r = run({ units: [{ make_type: "Xpander", plate: "ABC 1234" }, { make_type: "Xpander", plate: "ABC5678", color: "black" }] });
    expect(r.form.units.map((u) => [u.makeType, u.plate])).toEqual([["2022 Mitsubishi Xpander GLS", "ABC 1234"], ["2022 Mitsubishi Xpander GLS", "ABC 5678"]]);
  });
  it("a plate or make that is not in the inventory is kept as spoken", () => {
    const r = run({ units: [{ make_type: "2019 Ford Everest", plate: "ZZZ9999", color: "silver" }] });
    expect(r.form.units[0]).toMatchObject({ makeType: "2019 Ford Everest", plate: "ZZZ9999", color: "Silver" });
  });
  it("a trade-in, an in-lieu note, wallets, a check and the due date", () => {
    const r = run({
      price: 450000, sale: "cash", trade_in: { unit: "Honda City", year: "2015", plate: "DAB5555", value: 120000 }, lieu: { amount: 25000, until: "2026-11-30" },
      wallets: [{ name: "gcash", amount: 50000, ref: "12345" }], check: { amount: 40000, no: "001234", bank: "bpi" }, due_date: "2026-12-15",
    });
    expect([r.form.hasTi, r.form.ti.value, r.form.hasLieu, r.form.lieuAmount, r.form.dueMode, r.form.dueDate]).toEqual([true, "120,000", true, "25,000", "date", "2026-12-15"]);
    expect(r.form.methods.map((m) => [m.type, m.name, m.amount, m.bank])).toEqual([["wallet", "GCash", "50,000", ""], ["check", "", "40,000", "BPI"]]);
    const t = money(r);
    expect([t.due, t.today, t.balance]).toEqual([30500000, 9000000, 21500000]); // 450,000 − 120,000 trade-in − 25,000 in lieu of documents; 50,000 + 40,000 paid
  });
  it("what staff typed wins, and 'use what I heard' replaces it", () => {
    const form = { ...emptyForm(settings, today), receivedFrom: "Maria S.", price: "700,000" };
    const r = run({ buyer_name: "Maria Santos", price: 720000, buyer_address: "Pasig" }, form);
    expect([r.form.receivedFrom, r.form.price, r.form.address]).toEqual(["Maria S.", "700,000", "Pasig"]);
    expect(r.kept).toEqual(["the buyer's name", "the agreed price"]);
    const o = run({ buyer_name: "Maria Santos", price: 720000 }, r.form, r.fin, { overwrite: true });
    expect([o.form.receivedFrom, o.form.price]).toEqual(["Maria Santos", "720,000"]);
  });
  it("on a deal that is being continued only the payment is touched", () => {
    const r = run({ buyer_name: "Someone Else", price: 1, cash_today: 40000, wallets: [{ name: "Maya", amount: 5000 }], kind: "full" }, emptyForm(settings, today), emptyFin(), { linked: true });
    expect([r.form.receivedFrom, r.form.price, r.form.cash, r.form.kind, r.form.methods[0]?.name]).toEqual(["", "", "40,000", "full", "Maya"]);
  });
  it("hearing the same thing twice changes nothing", () => {
    const o = { buyer_name: "Maria Santos", price: 720000, sale: "financing", institution: "BDO", down_payment: 150000, cash_today: 120000, wallets: [{ name: "GCash", amount: 5000 }] };
    const a = run(o), b = run(o, a.form, a.fin);
    expect(b.form).toEqual(a.form);
    expect(b.fin).toEqual(a.fin);
    expect(b.kept).toEqual([]);
  });
});
