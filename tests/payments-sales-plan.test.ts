import { describe, expect, it } from "vitest";
import { planSales, saleKey, statusOf, type ExistingSale } from "@/lib/payments/sales-plan";
import type { SalePayment } from "@/lib/payments/parse";

const T = "SALES MONITORING NOVEMBER 2026";
const pay = (o: Partial<SalePayment>): SalePayment => ({ tab: T, row: 3, stage: "reservation", buyer: "Juan Dela Cruz", plate: "NKH7462", saleType: "Cash", agreedPrice: 610000, bank: "BDO", date: "2026-11-02", amount: 20000, arNo: "1078", ...o });

describe("sale records from the sales tab", () => {
  const pays = [pay({}), pay({ stage: "full", amount: 70000, arNo: "2545", date: "2026-11-09" }), pay({ stage: "split", amount: 520000, arNo: "", date: "2026-11-09" })];
  it("makes one new sale for a car with no record, with the total paid", () => {
    const [p] = planSales(pays, []);
    expect(p).toMatchObject({ action: "create", plate: "NKH7462", buyer: "JUAN DELA CRUZ", agreedPrice: 610000, soldOn: "2026-11-02", paid: 610000, status: "paid", sourceKey: saleKey(T, "NKH7462") });
    expect(p.arMissing).toBe(0); // the split has no AR by nature
  });
  it("updates the record with the same buyer, whatever the order of the name", () => {
    const ex: ExistingSale[] = [{ id: "s1", plate: "NKH7462", buyer: "DELA CRUZ, JUAN", sourceKey: "deal|d1|NKH7462", stage: "in_process" }];
    expect(planSales(pays, ex)[0]).toMatchObject({ action: "update", saleId: "s1" });
  });
  it("takes the record a typed deal made even when the sheet spells the name differently, and keeps the buyer when the sheet has none", () => {
    const ex: ExistingSale[] = [{ id: "s4", plate: "NKH7462", buyer: "APRIL JOY LILI", sourceKey: "deal|d9|NKH7462", stage: "in_process" }];
    expect(planSales([pay({ buyer: "APRIL JOY LIU" })], ex)[0]).toMatchObject({ action: "update", saleId: "s4", buyer: "APRIL JOY LIU" });
    expect(planSales([pay({ buyer: "" })], ex)[0]).toMatchObject({ action: "update", saleId: "s4", buyer: "APRIL JOY LILI" });
  });
  it("the sheet wins when another buyer is on the record, and the plan says so", () => {
    const ex: ExistingSale[] = [{ id: "s2", plate: "NKH7462", buyer: "MARIA SANTOS", sourceKey: null, stage: "delivered" }];
    const [p] = planSales(pays, ex);
    expect(p).toMatchObject({ action: "update", saleId: "s2", buyer: "JUAN DELA CRUZ" });
    expect(p.reason).toContain("MARIA SANTOS");
  });
  it("a cancelled old record does not hold the car", () => {
    const ex: ExistingSale[] = [{ id: "s3", plate: "NKH7462", buyer: "MARIA SANTOS", sourceKey: null, stage: "cancelled" }];
    expect(planSales(pays, ex)[0].action).toBe("create");
  });
  it("skips a row with no buyer, and counts payments with no AR", () => {
    expect(planSales([pay({ buyer: "" })], [])[0].action).toBe("skip");
    expect(planSales([pay({ arNo: "" })], [])[0].arMissing).toBe(1);
  });
  it("payment status: partly paid, paid, and the lender's payout", () => {
    expect(statusOf(0, 100, false, false)).toBe("unpaid");
    expect(statusOf(50, 100, false, false)).toBe("partial");
    expect(statusOf(100, 100, false, false)).toBe("paid");
    expect(statusOf(100, 100, true, false)).toBe("paid");
    expect(statusOf(100, 100, true, true)).toBe("loan_released");
  });
});
