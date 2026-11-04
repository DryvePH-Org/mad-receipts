import { describe, expect, it } from "vitest";
import { computePayment } from "@/lib/rules/payment";
import { amountDue, describeTerms, downPayment, EMPTY_TERMS, parseTerms, termsPayload, validateTerms, type TermsValues } from "@/lib/rules/terms";

const pesos = (n: number) => n * 100;
const terms = (over: Partial<TermsValues>, price = pesos(720_000)) => parseTerms({ ...EMPTY_TERMS, ...over }, price);

describe("amount due", () => {
  it("cash: the whole price", () => {
    expect(amountDue(terms({}).terms)).toBe(pesos(720_000));
  });

  it("financing: price - loan + fee (receipt 2540)", () => {
    const { terms: t } = terms({ type: "financing", loan: "130000", fee: "10000", financier: "GDFI" });
    expect(downPayment(t)).toBe(pesos(590_000));
    expect(amountDue(t)).toBe(pesos(600_000));
    // 20,000 paid earlier + 580,000 now covers it exactly.
    expect(computePayment({ amountDue: amountDue(t), totalPaidBefore: pesos(20_000), amount: pesos(580_000), isFirstReceipt: true, markedReservation: false })).toEqual({ balanceAfter: 0, paymentType: "full" });
  });

  it("trade-in: price - trade-in value", () => {
    expect(amountDue(terms({ type: "trade_in", tradeIn: "200,000" }).terms)).toBe(pesos(520_000));
  });

  it("only what belongs to the chosen type counts", () => {
    const { terms: t } = terms({ type: "cash", loan: "130000", fee: "10000", tradeIn: "5000" });
    expect([t.loan, t.fee, t.tradeIn]).toEqual([0, 0, 0]);
  });
});

describe("validateTerms", () => {
  const issues = (over: Partial<TermsValues>, price?: number) => {
    const { terms: t, unreadable } = terms(over, price);
    return validateTerms(t, unreadable).map((i) => `${i.level}:${i.field}`);
  };

  it("cash needs nothing more", () => expect(issues({})).toEqual([]));
  it("financing needs a loan below the price", () => {
    expect(issues({ type: "financing" })).toEqual(["error:loan"]);
    expect(issues({ type: "financing", loan: "720000" })).toEqual(["error:loan"]);
    expect(issues({ type: "financing", loan: "130000", financier: "BPI" })).toEqual([]);
  });
  it("financing without a company name is only a warning", () => {
    expect(issues({ type: "financing", loan: "130000" })).toEqual(["warning:financier"]);
  });
  it("trade-in needs a value below the price, and a description is encouraged", () => {
    expect(issues({ type: "trade_in" })).toEqual(["error:tradeIn"]);
    expect(issues({ type: "trade_in", tradeIn: "900000" })).toEqual(["error:tradeIn"]);
    expect(issues({ type: "trade_in", tradeIn: "200000" })).toEqual(["warning:tradeInDetails"]);
  });
  it("unreadable money is an error on that field", () => {
    expect(issues({ type: "financing", loan: "abc", financier: "BPI" })).toEqual(["error:loan"]);
  });
});

describe("payload and wording", () => {
  it("sends pesos with two decimals", () => {
    const { terms: t } = terms({ type: "financing", loan: "130,000", fee: "10000", financier: " GDFI " });
    expect(termsPayload(t)).toMatchObject({ transaction_type: "financing", loan_amount: "130000.00", processing_fee: "10000.00", financier: "GDFI", trade_in_value: "0.00" });
  });
  it("describes each type in one line", () => {
    expect(describeTerms(terms({}).terms)).toBe("Cash");
    expect(describeTerms(terms({ type: "financing", loan: "130000", fee: "10000", financier: "GDFI" }).terms)).toBe("Financing: loan ₱130,000 (GDFI) + fee ₱10,000");
    expect(describeTerms(terms({ type: "trade_in", tradeIn: "200000", tradeInDetails: "2015 Vios" }).terms)).toBe("Trade-in: ₱200,000 (2015 Vios) + cash");
  });
});
