import { describe, expect, it } from "vitest";
import { notifyDealOf, saleMoney, saleStatus, type SaleInput } from "@/lib/sales/money";
import { buildNotifications } from "@/lib/deal/status";
import { DEFAULT_SETTINGS } from "@/lib/deal/settings";

const sale = (o: Partial<SaleInput> = {}): SaleInput => ({ id: "s1", plate: "NKH7462", carText: "2020 TOYOTA VIOS", buyer: "JUAN", sales: "DAVID", financing: null, agreedPrice: 610000, soldOn: "2026-11-02", stage: "in_process",
  payments: [{ stage: "reservation", amount: 20000, paidOn: "2026-11-02", bank: "BDO", arNo: "1078" }, { stage: "full", amount: 70000, paidOn: "2026-11-09", bank: "BDO", arNo: "2545" }], ...o });

describe("a sale of the sheet as money", () => {
  it("balance is the price minus what came in, and it is due the allowed days after the first payment", () => {
    const m = saleMoney(sale(), 30);
    expect(m).toMatchObject({ price: 61_000_000, received: 9_000_000, balance: 52_000_000, dueDate: "2026-12-02", arNos: ["1078", "2545"] });
  });
  it("status: open, due soon, overdue, settled", () => {
    const m = saleMoney(sale(), 30);
    expect(saleStatus(m, "2026-11-20")).toBe("open");
    expect(saleStatus(m, "2026-11-28")).toBe("soon");
    expect(saleStatus(m, "2026-12-10")).toBe("overdue");
    expect(saleStatus(saleMoney(sale({ agreedPrice: 90000 }), 30), "2026-12-10")).toBe("settled");
  });
  it("more paid than the price is a balance of zero, never negative; no price means nothing to chase", () => {
    expect(saleMoney(sale({ agreedPrice: 50000 }), 30).balance).toBe(0);
    expect(saleMoney(sale({ agreedPrice: null }), 30)).toMatchObject({ balance: 0, dueDate: null });
  });
  it("a financed sale waits for the lender until its payout is in", () => {
    const wait = saleMoney(sale({ financing: "BDO", agreedPrice: 90000 }), 30);
    expect(saleStatus(wait, "2026-11-20")).toBe("lender");
    const paid = saleMoney(sale({ financing: "BDO", agreedPrice: 90000, payments: [...sale().payments, { stage: "financing", amount: 5, paidOn: "2026-11-15", bank: "BDO", arNo: null }] }), 30);
    expect(saleStatus(paid, "2026-11-20")).toBe("settled");
  });
  it("the reminder rules work on it, and a reminder opens the car by plate", () => {
    const list = buildNotifications([notifyDealOf(saleMoney(sale(), 30))], DEFAULT_SETTINGS.reminders, "2026-12-10");
    expect(list.map((n) => [n.key, n.dealId])).toEqual([["od-NKH7462", "NKH7462"]]);
    expect(list[0].title).toContain("JUAN");
  });
});
