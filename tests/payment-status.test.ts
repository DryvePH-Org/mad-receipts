import { describe, expect, it } from "vitest";
import { paymentStatusOfDeal } from "@/lib/sales/payment-status";

const deal = (over: Record<string, unknown> = {}) => ({ status: "open", balance: 480000, approved_paid: 20000, opening_paid: 0, sale_type: "cash", loan_status: "none", ...over });
describe("the payment status follows the receipts", () => {
  it("is Unpaid with no money, Partly paid with some, and Fully paid when a cash sale has no balance", () => {
    expect(paymentStatusOfDeal(deal({ approved_paid: 0, balance: 500000 }))).toBe("unpaid");
    expect(paymentStatusOfDeal(deal())).toBe("partial");
    expect(paymentStatusOfDeal(deal({ opening_paid: 100000, approved_paid: 0, balance: 400000 }))).toBe("partial"); // money received before the first receipt counts
    expect(paymentStatusOfDeal(deal({ approved_paid: 500000, balance: 0 }))).toBe("paid");
  });
  it("waits for the lender after the buyer's part is paid, and is Loan released once the loan is released", () => {
    const fin = { sale_type: "financing", approved_paid: 204800, balance: 0 };
    expect(paymentStatusOfDeal(deal({ ...fin, loan_status: "waiting" }))).toBe("partial");
    expect(paymentStatusOfDeal(deal({ ...fin, loan_status: "released" }))).toBe("loan_released");
  });
  it("clears the status of a cancelled deal, and reads numbers from the database as strings", () => {
    expect(paymentStatusOfDeal(deal({ status: "cancelled" }))).toBeNull();
    expect(paymentStatusOfDeal(deal({ balance: "0.00", approved_paid: "500000.00" }))).toBe("paid");
  });
});
