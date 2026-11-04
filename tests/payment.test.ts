import { describe, expect, it } from "vitest";
import {
  computePayment,
  dealStatusForBalance,
  unitStatusForDeal,
  type PaymentType,
} from "@/lib/rules/payment";
import type { UnitStatus } from "@/lib/inventory/types";

const pesos = (n: number) => n * 100;

/**
 * Plays a sequence of payments on one deal the way confirm_receipt will:
 * each step uses the running total, and only the first receipt can be earnest.
 */
function playDeal(amountDue: number, payments: { amount: number; reservation?: boolean }[]) {
  let totalPaid = 0;
  return payments.map(({ amount, reservation = false }, i) => {
    const result = computePayment({
      amountDue,
      totalPaidBefore: totalPaid,
      amount,
      isFirstReceipt: i === 0,
      markedReservation: reservation,
    });
    if (result.error) throw new Error(`payment ${i + 1}: ${result.error}`);
    totalPaid += amount;
    const dealStatus = dealStatusForBalance(result.balanceAfter);
    return {
      type: result.paymentType,
      balance: result.balanceAfter,
      dealStatus,
      unit: unitStatusForDeal(dealStatus),
    };
  });
}

describe("section 2.4 cases", () => {
  it("Case 1: 50k earnest, then 450k → earnest, full; unit Reserved → Sold", () => {
    const steps = playDeal(pesos(500_000), [
      { amount: pesos(50_000), reservation: true },
      { amount: pesos(450_000) },
    ]);
    expect(steps.map((s) => s.type)).toEqual<PaymentType[]>(["earnest", "full"]);
    expect(steps.map((s) => s.balance)).toEqual([pesos(450_000), 0]);
    expect(steps.map((s) => s.dealStatus)).toEqual(["open", "completed"]);
    expect(steps.map((s) => s.unit)).toEqual<UnitStatus[]>(["Reserved", "Sold"]);
  });

  it("Case 2: 100k earnest, 100k, then the rest → earnest, partial, full", () => {
    const steps = playDeal(pesos(500_000), [
      { amount: pesos(100_000), reservation: true },
      { amount: pesos(100_000) },
      { amount: pesos(300_000) },
    ]);
    expect(steps.map((s) => s.type)).toEqual<PaymentType[]>(["earnest", "partial", "full"]);
    expect(steps.map((s) => s.balance)).toEqual([pesos(400_000), pesos(300_000), 0]);
    expect(steps.map((s) => s.unit)).toEqual<UnitStatus[]>(["Reserved", "Reserved", "Sold"]);
  });

  it("Case 3: 250k on a 500k car, no earnest → partial, then full", () => {
    const steps = playDeal(pesos(500_000), [
      { amount: pesos(250_000) },
      { amount: pesos(250_000) },
    ]);
    expect(steps.map((s) => s.type)).toEqual<PaymentType[]>(["partial", "full"]);
    expect(steps.map((s) => s.unit)).toEqual<UnitStatus[]>(["Reserved", "Sold"]);
  });

  it("Case 4: buyer backs out after earnest → cancelled deal frees the unit", () => {
    const [earnest] = playDeal(pesos(500_000), [{ amount: pesos(50_000), reservation: true }]);
    expect(earnest.type).toBe("earnest");
    expect(earnest.unit).toBe("Reserved");
    // Cancellation (admin, Phase 11) sets the deal to cancelled.
    expect(unitStatusForDeal("cancelled")).toBe("Available");
  });
});

describe("computePayment", () => {
  const base = {
    amountDue: pesos(500_000),
    totalPaidBefore: 0,
    isFirstReceipt: true,
    markedReservation: false,
  };

  it("blocks overpayment, even by one centavo", () => {
    expect(computePayment({ ...base, amount: pesos(500_000) + 1 })).toMatchObject({
      paymentType: null,
      error: "overpayment",
      balanceAfter: -1,
    });
    expect(
      computePayment({ ...base, totalPaidBefore: pesos(450_000), isFirstReceipt: false, amount: pesos(60_000) }),
    ).toMatchObject({ error: "overpayment" });
  });

  it("full payment wins over the reservation tick", () => {
    expect(computePayment({ ...base, amount: pesos(500_000), markedReservation: true }).paymentType).toBe(
      "full",
    );
  });

  it("only the first receipt can be earnest", () => {
    const second = computePayment({
      ...base,
      totalPaidBefore: pesos(50_000),
      isFirstReceipt: false,
      markedReservation: true,
      amount: pesos(10_000),
    });
    expect(second.paymentType).toBe("partial");
  });

  it("works to the centavo with no float drift", () => {
    // ₱0.10 + ₱0.20 against ₱0.30: exact in centavos.
    const first = computePayment({ ...base, amountDue: 30, amount: 10 });
    const second = computePayment({ ...base, amountDue: 30, totalPaidBefore: 10, isFirstReceipt: false, amount: 20 });
    expect(first).toMatchObject({ balanceAfter: 20, paymentType: "partial" });
    expect(second).toMatchObject({ balanceAfter: 0, paymentType: "full" });

    const odd = computePayment({ ...base, amountDue: 123_456_78, amount: 23_456_77 });
    expect(odd.balanceAfter).toBe(100_000_01);
  });

  it("rejects zero, negative and non-integer amounts", () => {
    expect(computePayment({ ...base, amount: 0 }).error).toBe("amount_not_positive");
    expect(computePayment({ ...base, amount: -100 }).error).toBe("amount_not_positive");
    expect(computePayment({ ...base, amount: 100.5 }).error).toBe("invalid_input");
    expect(computePayment({ ...base, amountDue: 0, amount: 100 }).error).toBe("invalid_input");
  });
});
